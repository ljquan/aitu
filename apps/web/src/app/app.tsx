import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Drawnix,
  WorkspaceService,
  migrateToWorkspace,
  isWorkspaceMigrationCompleted,
  Board,
  BoardChangeData,
  TreeNode,
  crashRecoveryService,
  safeReload,
  useDocumentTitle,
} from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import { MessagePlugin } from 'tdesign-react';
import { CrashRecoveryDialog } from './CrashRecoveryDialog';

// 节流保存 viewport 的间隔（毫秒）
const VIEWPORT_SAVE_DEBOUNCE = 500;

// URL 参数名
const BOARD_URL_PARAM = 'board';

// Global flag to prevent duplicate initialization in StrictMode
let appInitialized = false;

/**
 * 从 URL 获取画布 ID 参数
 */
function getBoardIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(BOARD_URL_PARAM);
}

/**
 * 更新 URL 中的画布 ID 参数（不刷新页面）
 */
function updateBoardIdInUrl(boardId: string | null): void {
  const url = new URL(window.location.href);
  if (boardId) {
    url.searchParams.set(BOARD_URL_PARAM, boardId);
  } else {
    url.searchParams.delete(BOARD_URL_PARAM);
  }
  // 使用 replaceState 避免产生新的历史记录
  window.history.replaceState({}, '', url.toString());
}

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [showCrashDialog, setShowCrashDialog] = useState(false);
  const [value, setValue] = useState<{
    children: PlaitElement[];
    viewport?: Viewport;
    theme?: PlaitTheme;
  }>({ children: [] });
  // 当前画板 ID，用于更新页面标题
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);

  // 存储最新的 viewport，用于页面关闭前保存
  const latestViewportRef = useRef<Viewport | undefined>();
  // 防抖定时器
  const viewportSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 useDocumentTitle hook 管理页面标题
  useDocumentTitle(currentBoardId);

  // Initialize workspace and handle migration
  useEffect(() => {
    const initialize = async () => {
      // 检查是否需要显示崩溃恢复对话框
      if (crashRecoveryService.shouldShowSafeModePrompt() && !crashRecoveryService.isSafeMode()) {
        setShowCrashDialog(true);
        setIsLoading(false);
        return;
      }

      // Prevent duplicate initialization in StrictMode
      if (appInitialized) {
        // 等待 workspaceService 完全初始化
        const workspaceService = WorkspaceService.getInstance();
        await workspaceService.waitForInitialization();
        // 使用 switchBoard 确保加载完整数据
        const currentBoardId = workspaceService.getState().currentBoardId;
        // 验证画板是否存在，防止旧状态中的 currentBoardId 指向不存在的画板
        if (currentBoardId && workspaceService.getBoardMetadata(currentBoardId)) {
          const currentBoard = await workspaceService.switchBoard(currentBoardId);
          setValue({
            children: currentBoard.elements || [],
            viewport: currentBoard.viewport,
            theme: currentBoard.theme,
          });
        }
        setIsLoading(false);
        // 标记加载完成
        crashRecoveryService.markLoadingComplete();
        return;
      }
      appInitialized = true;

      try {
        const workspaceService = WorkspaceService.getInstance();
        await workspaceService.initialize();

        // Check and perform migration if needed
        const migrated = await isWorkspaceMigrationCompleted();
        if (!migrated) {
          await migrateToWorkspace();
        }

        // 安全模式：优先复用已有的空白安全模式画板，否则创建新的
        if (crashRecoveryService.isSafeMode()) {
          console.log('[App] Safe mode: looking for existing safe mode board');
          
          // 查找已有的安全模式画板（名称以 "安全模式" 开头且元素为空）
          const allBoards = workspaceService.getAllBoards();
          let safeModeBoard = allBoards.find(
            b => b.name.startsWith('安全模式') && (!b.elements || b.elements.length === 0)
          );
          
          if (safeModeBoard) {
            console.log('[App] Safe mode: reusing existing board:', safeModeBoard.name);
            await workspaceService.switchBoard(safeModeBoard.id);
            setCurrentBoardId(safeModeBoard.id);
          } else {
            console.log('[App] Safe mode: creating new blank board');
            // 使用时间戳生成唯一名称，避免名称冲突
            const timestamp = new Date().toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }).replace(/\//g, '-');
            const board = await workspaceService.createBoard({
              name: `安全模式 ${timestamp}`,
              elements: [],
            });
            if (board) {
              await workspaceService.switchBoard(board.id);
              setCurrentBoardId(board.id);
            }
          }
          
          setValue({ children: [] });
          setIsDataReady(true);
          setIsLoading(false);
          crashRecoveryService.markLoadingComplete();
          
          // 安全模式成功加载后，清除安全模式标记（下次正常加载）
          crashRecoveryService.disableSafeMode();
          
          // 提示用户当前处于安全模式
          setTimeout(() => {
            MessagePlugin.warning({
              content: '当前处于安全模式，已创建空白画布。可从侧边栏切换到其他画布。',
              duration: 8000,
              closeBtn: true,
            });
          }, 500);
          return;
        }

        // Load current board data if available
        let currentBoard: Board | null = null;
        
        // 优先使用 URL 参数中的画布 ID
        const urlBoardId = getBoardIdFromUrl();
        const stateBoardId = workspaceService.getState().currentBoardId;
        
        // 确定要加载的画布 ID（优先级：URL 参数 > 上次状态）
        let targetBoardId: string | null = null;
        if (urlBoardId && workspaceService.getBoardMetadata(urlBoardId)) {
          targetBoardId = urlBoardId;
        } else if (stateBoardId && workspaceService.getBoardMetadata(stateBoardId)) {
          targetBoardId = stateBoardId;
        }

        // If has target board ID, load it via switchBoard (triggers lazy loading)
        if (targetBoardId) {
          currentBoard = await workspaceService.switchBoard(targetBoardId);
        } else if (workspaceService.hasBoards()) {
          // No valid board ID, select first available board
          const tree = workspaceService.getTree();
          const firstBoard = findFirstBoard(tree);
          if (firstBoard) {
            currentBoard = await workspaceService.switchBoard(firstBoard.id);
          }
        } else {
          // No boards exist, create default board
          const board = await workspaceService.createBoard({
            name: '我的画板1',
            elements: [],
          });

          if (board) {
            currentBoard = await workspaceService.switchBoard(board.id);
          }
        }
        // 更新 URL 参数和当前画布 ID
        if (currentBoard) {
          updateBoardIdInUrl(currentBoard.id);
          setCurrentBoardId(currentBoard.id);
        }

        if (currentBoard) {
          const elements = currentBoard.elements || [];
          
          // 先设置原始元素，让页面先渲染
          setValue({
            children: elements,
            viewport: currentBoard.viewport,
            theme: currentBoard.theme,
          });

          // 异步恢复视频 URL，不阻塞页面加载
          recoverVideoUrlsInElements(elements)
            .then((recoveredElements) => {
              // 只有当有元素被恢复时才更新
              if (recoveredElements !== elements) {
                setValue((prev) => ({
                  ...prev,
                  children: recoveredElements,
                }));
              }
            })
            .catch((error) => {
              console.error('[App] Video URL recovery failed:', error);
            });
        }
      } catch (error) {
        console.error('[App] Initialization failed:', error);
      } finally {
        setIsDataReady(true);
        setIsLoading(false);
        // 标记加载完成
        crashRecoveryService.markLoadingComplete();
      }
    };

    initialize();
  }, []);

  // Handle board switching
  const handleBoardSwitch = useCallback(async (board: Board) => {
    console.log('[App] handleBoardSwitch called:', board.id);
    
    // 在设置 state 之前，预先恢复失效的视频 URL
    const elements = await recoverVideoUrlsInElements(board.elements || []);

    setValue({
      children: elements,
      viewport: board.viewport,
      theme: board.theme,
    });
    
    // 更新 URL 参数
    console.log('[App] Updating URL with board id:', board.id);
    updateBoardIdInUrl(board.id);
    
    // 更新当前画板 ID（用于页面标题更新）
    setCurrentBoardId(board.id);
  }, []);

  // Handle board changes (auto-save)
  const handleBoardChange = useCallback(
    (data: BoardChangeData) => {
      setValue(data);
      // 同步更新最新 viewport
      latestViewportRef.current = data.viewport;

      // Save to current board
      const workspaceService = WorkspaceService.getInstance();
      workspaceService.saveCurrentBoard(data).catch((err: Error) => {
        console.error('[App] Failed to save board:', err);
      });
    },
    []
  );

  // Handle viewport changes (pan/zoom) - 单独保存 viewport
  const handleViewportChange = useCallback(
    (viewport: Viewport) => {
      // 更新最新 viewport
      latestViewportRef.current = viewport;

      // 防抖保存
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }
      viewportSaveTimerRef.current = setTimeout(() => {
        const workspaceService = WorkspaceService.getInstance();
        const currentBoard = workspaceService.getCurrentBoard();
        if (currentBoard) {
          // 只保存 viewport，不影响其他数据
          workspaceService.saveCurrentBoard({
            children: currentBoard.elements,
            viewport: viewport,
            theme: currentBoard.theme,
          }).catch((err: Error) => {
            console.error('[App] Failed to save viewport:', err);
          });
        }
      }, VIEWPORT_SAVE_DEBOUNCE);
    },
    []
  );

  // 页面关闭/隐藏前保存 viewport
  useEffect(() => {
    // 立即保存 viewport 的函数
    const saveViewportImmediately = () => {
      // 清除防抖定时器
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = null;
      }

      // 同步保存最新的 viewport
      const viewport = latestViewportRef.current;
      if (viewport) {
        const workspaceService = WorkspaceService.getInstance();
        const currentBoard = workspaceService.getCurrentBoard();
        if (currentBoard) {
          // 直接更新内存中的 board 数据
          currentBoard.viewport = viewport;
          // 尝试保存
          workspaceService.saveCurrentBoard({
            children: currentBoard.elements,
            viewport: viewport,
            theme: currentBoard.theme,
          }).catch(() => {
            // 忽略错误
          });
        }
      }
    };

    const handleBeforeUnload = () => {
      saveViewportImmediately();
    };

    // 页面隐藏时也保存（处理移动端和标签页切换）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveViewportImmediately();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // 清理定时器
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }
    };
  }, []);

  // 处理安全模式选择
  const handleSafeModeChoice = useCallback((useSafeMode: boolean) => {
    setShowCrashDialog(false);
    if (useSafeMode) {
      crashRecoveryService.enableSafeMode();
    } else {
      crashRecoveryService.clearCrashState();
    }
    // 重新初始化
    setIsLoading(true);
    appInitialized = false;
    // 使用 setTimeout 确保状态更新后再触发 useEffect
    setTimeout(() => {
      safeReload();
    }, 100);
  }, []);

  // 显示崩溃恢复对话框
  if (showCrashDialog) {
    return (
      <CrashRecoveryDialog
        crashCount={crashRecoveryService.getCrashCount()}
        memoryInfo={crashRecoveryService.getMemoryInfo()}
        onUseSafeMode={() => handleSafeModeChoice(true)}
        onIgnore={() => handleSafeModeChoice(false)}
      />
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        加载中...
      </div>
    );
  }

  return (
    <div style={{ height: '100vh' }}>
      <Drawnix
        value={value.children}
        viewport={value.viewport}
        theme={value.theme}
        onChange={handleBoardChange}
        onViewportChange={handleViewportChange}
        onBoardSwitch={handleBoardSwitch}
        isDataReady={isDataReady}
        afterInit={(board) => {
          (
            window as unknown as {
              __drawnix__web__console: (value: string) => void;
            }
          )['__drawnix__web__console'] = (value: string) => {
            addDebugLog(board, value);
          };
        }}
      />
    </div>
  );
}

const addDebugLog = (board: PlaitBoard, value: string) => {
  const container = PlaitBoard.getBoardContainer(board).closest(
    '.drawnix'
  ) as HTMLElement;
  let consoleContainer = container.querySelector('.drawnix-console');
  if (!consoleContainer) {
    consoleContainer = document.createElement('div');
    consoleContainer.classList.add('drawnix-console');
    container.append(consoleContainer);
  }
  const div = document.createElement('div');
  div.innerHTML = value;
  consoleContainer.append(div);
};

/**
 * 迁移元素数组中的视频 URL 格式
 * 新格式 (/__aitu_cache__/video/...) 是稳定的，由 Service Worker 直接从 Cache API 返回
 * 旧格式 (blob:...#merged-video-xxx) 需要迁移到新格式
 */
async function recoverVideoUrlsInElements(
  elements: PlaitElement[]
): Promise<PlaitElement[]> {
  return elements.map((element) => {
    const url = (element as any).url as string | undefined;

    // 新格式：稳定 URL，无需处理
    if (url?.startsWith('/__aitu_cache__/video/')) {
      return element;
    }

    // 旧格式：blob URL + #merged-video-xxx
    // 提取 taskId，转换为新格式
    if (url?.startsWith('blob:') && url.includes('#merged-video-')) {
      const hashIndex = url.indexOf('#merged-video-');
      if (hashIndex !== -1) {
        const afterHash = url.substring(hashIndex + 1);
        const nextHashIndex = afterHash.indexOf('#', 1);
        const taskId =
          nextHashIndex > 0 ? afterHash.substring(0, nextHashIndex) : afterHash;

        // 转换为新格式的稳定 URL（带 .mp4 后缀）
        const newUrl = `/__aitu_cache__/video/${taskId}.mp4`;
        // console.log(`[App] Migrating video URL: ${taskId}`);
        return { ...element, url: newUrl };
      }
    }

    return element;
  });
}

/**
 * 从树结构中找到第一个画板
 */
function findFirstBoard(nodes: TreeNode[]): Board | null {
  for (const node of nodes) {
    if (node.type === 'board') {
      return node.data;
    }
    if (node.type === 'folder' && node.children) {
      const board = findFirstBoard(node.children);
      if (board) return board;
    }
  }
  return null;
}

export default App;
