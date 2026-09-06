import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface FileDragDataTransfer {
  files?: FileList | null;
  types?: readonly string[] | DOMStringList;
}

export function hasLocalFileDrag(
  dataTransfer?: FileDragDataTransfer | null
): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;

  const types = dataTransfer.types;
  if (!types) return false;
  if (Array.isArray(types)) return types.includes('Files');
  return Array.from(types).includes('Files');
}

export function getDroppedFiles(
  dataTransfer?: FileDragDataTransfer | null
): File[] {
  if (!dataTransfer?.files) return [];
  return Array.from(dataTransfer.files);
}

interface LocalFileDropOptions {
  disabled?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
}

export function useLocalFileDrop({
  disabled = false,
  onFiles,
}: LocalFileDropOptions) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
  }, []);

  useEffect(() => {
    if (disabled) resetDragState();
  }, [disabled, resetDragState]);

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!hasLocalFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    },
    [disabled]
  );

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!hasLocalFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!disabled) event.dataTransfer.dropEffect = 'copy';
    },
    [disabled]
  );

  const onDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!hasLocalFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingFiles(false);
    },
    [disabled]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!hasLocalFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      resetDragState();
      if (disabled) return;

      const files = getDroppedFiles(event.dataTransfer);
      if (files.length > 0) void onFiles(files);
    },
    [disabled, onFiles, resetDragState]
  );

  return {
    isDraggingFiles,
    dropTargetProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
  };
}
