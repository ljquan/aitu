import { useState, useEffect, useCallback } from 'react';
import {
  Drawnix,
  WorkspaceService,
  migrateToWorkspace,
  isWorkspaceMigrationCompleted,
  Branch,
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
          const branchId = await migrateToWorkspace();
          if (branchId) {
            console.log('[App] Migrated legacy data to workspace, branch:', branchId);
          }
        }

        // Load current branch data if available
        let currentBranch = workspaceService.getCurrentBranch();

        // If no current branch and no projects exist, create default project with initializeData
        if (!currentBranch && !workspaceService.hasProjects()) {
          console.log('[App] First visit, creating default project with initial data');
          const project = await workspaceService.createProject({
            name: '默认画板',
            elements: initializeData,
          });

          if (project) {
            const branch = await workspaceService.switchBranch(project.defaultBranchId);
            currentBranch = branch;
            console.log('[App] Created default project:', project.name);
          }
        }

        if (currentBranch) {
          setValue({
            children: currentBranch.elements || [],
            viewport: currentBranch.viewport,
            theme: currentBranch.theme,
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

  // Handle branch switching
  const handleBranchSwitch = useCallback((branch: Branch) => {
    console.log('[App] Branch switched:', branch.name);
    setValue({
      children: branch.elements || [],
      viewport: branch.viewport,
      theme: branch.theme,
    });
  }, []);

  // Handle board changes (auto-save)
  const handleBoardChange = useCallback(
    (data: BoardChangeData) => {
      setValue(data);

      // Save to current branch
      const workspaceService = WorkspaceService.getInstance();
      workspaceService.saveCurrentBranch(data).catch((err: Error) => {
        console.error('[App] Failed to save branch:', err);
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
        enableWorkspace={true}
        onBranchSwitch={handleBranchSwitch}
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
