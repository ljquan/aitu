import { useState, useEffect, useCallback } from 'react';
import {
  Drawnix,
  WorkspaceService,
  migrateToWorkspace,
  isWorkspaceMigrationCompleted,
  Board,
  BoardChangeData,
  mediaCacheService,
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
          const boardId = await migrateToWorkspace();
          if (boardId) {
            console.log('[App] Migrated legacy data to workspace, board:', boardId);
          }
        }

        // Load current board data if available
        let currentBoard = workspaceService.getCurrentBoard();

        // If no current board and no boards exist, create default board with initializeData
        if (!currentBoard && !workspaceService.hasBoards()) {
          console.log('[App] First visit, creating default board with initial data');

          let initialElements: PlaitElement[] = [];
          try {
            const response = await fetch(`/init.json?v=${import.meta.env.VITE_APP_VERSION}`);
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
            console.log('[App] Created default board:', board.name);
          }
        }

        if (currentBoard) {
          // 在设置 state 之前，预先恢复失效的视频 URL
          const elements = await recoverVideoUrlsInElements(currentBoard.elements || []);

          setValue({
            children: elements,
            viewport: currentBoard.viewport,
            theme: currentBoard.theme,
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
    console.log('[App] Board switched:', board.name);

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
          console.log('board initialized');
          console.log(
            `add __drawnix__web__debug_log to window, so you can call add log anywhere, like: window.__drawnix__web__console('some thing')`
          );
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
async function recoverVideoUrlsInElements(elements: PlaitElement[]): Promise<PlaitElement[]> {
  console.log('[App] Recovering video URLs in elements...');

  const recoveredElements = await Promise.all(
    elements.map(async (element) => {
      const url = (element as any).url as string | undefined;

      // 检查是否是合并视频的 URL
      if (url && url.startsWith('blob:') && url.includes('#merged-video-')) {
        // 提取 taskId
        const mergedVideoIndex = url.indexOf('#merged-video-');
        if (mergedVideoIndex === -1) return element;

        const afterHash = url.substring(mergedVideoIndex + 1);
        const nextHashIndex = afterHash.indexOf('#', 1);
        const taskId = nextHashIndex > 0 ? afterHash.substring(0, nextHashIndex) : afterHash;

        try {
          // 从 IndexedDB 恢复
          const cached = await mediaCacheService.getCachedMedia(taskId);
          if (cached && cached.blob) {
            const newBlobUrl = URL.createObjectURL(cached.blob);
            const newUrl = `${newBlobUrl}#${taskId}`;

            console.log('[App] Video URL recovered:', {
              taskId,
              oldUrl: url,
              newUrl,
              size: cached.blob.size,
            });

            // 返回更新后的元素
            return { ...element, url: newUrl };
          } else {
            console.warn('[App] Cache not found for taskId:', taskId);
          }
        } catch (error) {
          console.error('[App] Failed to recover video:', taskId, error);
        }
      }

      return element;
    })
  );

  return recoveredElements;
}

export default App;
