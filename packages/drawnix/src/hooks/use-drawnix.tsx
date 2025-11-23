/**
 * A React context for sharing the board object, in a way that re-renders the
 * context whenever changes occur.
 */
import { PlaitBoard, PlaitPointerType } from '@plait/core';
import { createContext, useContext } from 'react';
import { MindPointerType } from '@plait/mind';
import { DrawPointerType } from '@plait/draw';
import { FreehandShape } from '../plugins/freehand/type';
import { Editor } from 'slate';
import { LinkElement } from '@plait/common';

export enum DialogType {
  mermaidToDrawnix = 'mermaidToDrawnix',
  markdownToDrawnix = 'markdownToDrawnix',
  aiImageGeneration = 'aiImageGeneration',
  aiVideoGeneration = 'aiVideoGeneration',
}

export type DrawnixPointerType =
  | PlaitPointerType
  | MindPointerType
  | DrawPointerType
  | FreehandShape;

export interface DrawnixBoard extends PlaitBoard {
  appState: DrawnixState;
}

export type LinkState = {
  targetDom: HTMLElement;
  editor: Editor;
  targetElement: LinkElement;
  isEditing: boolean;
  isHovering: boolean;
  isHoveringOrigin: boolean;
};

export type DialogInitialData = {
  prompt?: string;
  width?: number;
  height?: number;
  duration?: number;
  resultUrl?: string;  // 已生成的结果URL,用于显示预览
  [key: string]: any;
};

export type DrawnixState = {
  pointer: DrawnixPointerType;
  isMobile: boolean;
  isPencilMode: boolean;
  openDialogType: DialogType | null;
  dialogInitialData?: DialogInitialData | null;
  openCleanConfirm: boolean;
  openSettings: boolean;
  linkState?: LinkState | null;
};

export const DrawnixContext = createContext<{
  appState: DrawnixState;
  setAppState: (appState: DrawnixState) => void;
  board: DrawnixBoard | null;
} | null>(null);

export const useDrawnix = (): {
  appState: DrawnixState;
  setAppState: (appState: DrawnixState) => void;
  board: DrawnixBoard | null;
  openDialog: (dialogType: DialogType, initialData?: DialogInitialData) => void;
} => {
  const context = useContext(DrawnixContext);

  if (!context) {
    throw new Error(
      `The \`useDrawnix\` hook must be used inside the <Drawnix> component's context.`
    );
  }

  const openDialog = (dialogType: DialogType, initialData?: DialogInitialData) => {
    context.setAppState({
      ...context.appState,
      openDialogType: dialogType,
      dialogInitialData: initialData || null
    });
  };

  return { ...context, openDialog };
};

export const useSetPointer = () => {
  const { appState, setAppState } = useDrawnix();
  return (pointer: DrawnixPointerType) => {
    setAppState({ ...appState, pointer });
  };
};
