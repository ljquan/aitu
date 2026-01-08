import { useState, useEffect, useCallback } from 'react';
import {
  Drawnix,
  WorkspaceService,
  migrateToWorkspace,
  isWorkspaceMigrationCompleted,
  Board,
  BoardChangeData,
  unifiedCacheService,
} from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [value, setValue] = useState<{
    children: PlaitElement[];
    viewport?: Viewport;
    theme?: PlaitTheme;
  }>({ children: [] });

  // Initialize workspace and handle migration
  useEffect(() => {
    const initialize = async () => {
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

        // If no current board and no boards exist, create default board with initializeData
        if (!currentBoard && !workspaceService.hasBoards()) {
          let initialElements: PlaitElement[] = [];
          try {
            const response = await fetch(
              `/init.json?v=${import.meta.env.VITE_APP_VERSION}`
            );
            if (response.ok) {
              const data = await response.json();
              initialElements = data.elements || [];
            }
          } catch (error) {
            console.error('[App] Failed to load initial data:', error);
          }

          const board = await workspaceService.createBoard({
            name: '默认画板',
            elements: initialElements,
          });

          if (board) {
            const switchedBoard = await workspaceService.switchBoard(board.id);
            currentBoard = switchedBoard;
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

      // Save to current board
      const workspaceService = WorkspaceService.getInstance();
      workspaceService.saveCurrentBoard(data).catch((err: Error) => {
        console.error('[App] Failed to save board:', err);
      });
    },
    []
  );

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
        onBoardSwitch={handleBoardSwitch}
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
 * 恢复元素数组中失效的视频 Blob URL
 * 在数据加载后、渲染之前调用，避免视频加载失败
 */
async function recoverVideoUrlsInElements(
  elements: PlaitElement[]
): Promise<PlaitElement[]> {
  // 添加超时保护，避免永久卡住
  const TIMEOUT_MS = 5000;

  const recoverWithTimeout = async (
    element: PlaitElement,
    index: number
  ): Promise<PlaitElement> => {
    const url = (element as any).url as string | undefined;

    // 检查是否是合并视频的 URL
    if (url && url.startsWith('blob:') && url.includes('#merged-video-')) {
      // 提取 taskId
      const mergedVideoIndex = url.indexOf('#merged-video-');
      if (mergedVideoIndex === -1) return element;

      const afterHash = url.substring(mergedVideoIndex + 1);
      const nextHashIndex = afterHash.indexOf('#', 1);
      const taskId =
        nextHashIndex > 0 ? afterHash.substring(0, nextHashIndex) : afterHash;

      try {
        // 添加超时保护
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
        );

        const cachedBlob = await Promise.race([
          unifiedCacheService.getCachedBlob(taskId),
          timeoutPromise,
        ]);

        if (cachedBlob) {
          const newBlobUrl = URL.createObjectURL(cachedBlob);
          const newUrl = `${newBlobUrl}#${taskId}`;

          // 返回更新后的元素
          return { ...element, url: newUrl };
        }
      } catch (error) {
        console.error(`[App] Element ${index}: Failed to recover video:`, taskId, error);
      }
    }

    return element;
  };

  try {
    const recoveredElements = await Promise.all(
      elements.map((element, index) => recoverWithTimeout(element, index))
    );
    return recoveredElements;
  } catch (error) {
    console.error('[App] Video URL recovery failed:', error);
    return elements; // 返回原始元素，避免卡住
  }
}

export default App;
