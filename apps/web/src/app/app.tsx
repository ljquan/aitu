import { useState, useEffect } from 'react';
import { initializeData } from './initialize-data';
import { Drawnix } from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import localforage from 'localforage';
import { OLD_DRAWNIX_LOCAL_DATA_KEY, DRAWNIX_STORE_NAME } from '@drawnix/drawnix';

const MAIN_BOARD_CONTENT_KEY = 'main_board_content';

localforage.config({
  name: 'Drawnix',
  storeName: DRAWNIX_STORE_NAME,
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

export function App() {
  const [value, setValue] = useState<{
    children: PlaitElement[];
    viewport?: Viewport;
    theme?: PlaitTheme;
  }>({ children: [] });

  useEffect(() => {
    const loadData = async () => {
      const storedData = await localforage.getItem<{
        children: PlaitElement[];
        viewport?: Viewport;
        theme?: PlaitTheme;
      }>(MAIN_BOARD_CONTENT_KEY);
      if (storedData) {
        setValue(storedData);
        return;
      }
      const localData = localStorage.getItem(OLD_DRAWNIX_LOCAL_DATA_KEY);
      if (localData) {
        const parsedData = JSON.parse(localData);
        setValue(parsedData);
        await localforage.setItem(MAIN_BOARD_CONTENT_KEY, parsedData);
        localStorage.removeItem(OLD_DRAWNIX_LOCAL_DATA_KEY);
        return;
      }
      setValue({ children: initializeData });
    };

    loadData();
  }, []);
  return (
    <Drawnix
      value={value.children}
      viewport={value.viewport}
      theme={value.theme}
      onChange={(value) => {
        localforage.setItem(MAIN_BOARD_CONTENT_KEY, value);
        setValue(value);
      }}
      afterInit={(board) => {
        console.log('board initialized');
        console.log(
          `add __drawnix__web__debug_log to window, so you can call add log anywhere, like: window.__drawnix__web__console('some thing')`
        );
        (window as unknown as { __drawnix__web__console: (value: string) => void })['__drawnix__web__console'] = (value: string) => {
          addDebugLog(board, value);
        };
      }}
    ></Drawnix>
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
