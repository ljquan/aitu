import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Drawnix,
  WorkspaceService,
  migrateToWorkspace,
  isWorkspaceMigrationCompleted,
  Board,
  BoardChangeData,
  TreeNode,
} from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';

// 节流保存 viewport 的间隔（毫秒）
const VIEWPORT_SAVE_DEBOUNCE = 500;

// Global flag to prevent duplicate initialization in StrictMode
let appInitialized = false;

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [value, setValue] = useState<{
    children: PlaitElement[];
    viewport?: Viewport;
    theme?: PlaitTheme;
  }>({ children: [] });

  // 存储最新的 viewport，用于页面关闭前保存
  const latestViewportRef = useRef<Viewport | undefined>();
  // 防抖定时器
  const viewportSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize workspace and handle migration
  useEffect(() => {
    const initialize = async () => {
      // Prevent duplicate initialization in StrictMode
      if (appInitialized) {
        // 等待 workspaceService 完全初始化
        const workspaceService = WorkspaceService.getInstance();
        await workspaceService.waitForInitialization();
        const currentBoard = workspaceService.getCurrentBoard();
        if (currentBoard) {
          setValue({
            children: currentBoard.elements || [],
            viewport: currentBoard.viewport,
            theme: currentBoard.theme,
          });
        }
        setIsLoading(false);
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

        // Load current board data if available
        let currentBoard = workspaceService.getCurrentBoard();

        // If no current board, try to select first available board or create new one
        if (!currentBoard) {
          if (workspaceService.hasBoards()) {
            // Select first available board
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
              const switchedBoard = await workspaceService.switchBoard(board.id);
              currentBoard = switchedBoard;
            }
          }
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
      }
    };

    initialize();
  }, []);

  // Handle board switching
  const handleBoardSwitch = useCallback(async (board: Board) => {
    // 在设置 state 之前，预先恢复失效的视频 URL
    const elements = await recoverVideoUrlsInElements(board.elements || []);

    setValue({
      children: elements,
      viewport: board.viewport,
      theme: board.theme,
    });
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
