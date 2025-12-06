import { useState, useEffect, useCallback } from 'react';
import {
  Drawnix,
  WorkspaceService,
  migrateToWorkspace,
  isWorkspaceMigrationCompleted,
  Board,
  BoardChangeData,
} from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import { initializeData } from './initialize-data';

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
          const board = await workspaceService.createBoard({
            name: '默认画板',
            elements: initializeData,
          });

          if (board) {
            const switchedBoard = await workspaceService.switchBoard(board.id);
            currentBoard = switchedBoard;
            console.log('[App] Created default board:', board.name);
          }
        }

        if (currentBoard) {
          setValue({
            children: currentBoard.elements || [],
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
  const handleBoardSwitch = useCallback((board: Board) => {
    console.log('[App] Board switched:', board.name);
    setValue({
      children: board.elements || [],
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

export default App;
