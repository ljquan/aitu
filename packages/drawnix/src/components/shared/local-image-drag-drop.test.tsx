// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  getDroppedFiles,
  hasLocalFileDrag,
  useLocalFileDrop,
} from './local-image-drag-drop';

function DropTarget({
  disabled = false,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const { isDraggingFiles, dropTargetProps } = useLocalFileDrop({
    disabled,
    onFiles,
  });
  return (
    <div
      data-testid="drop-target"
      data-dragging={isDraggingFiles}
      {...dropTargetProps}
    >
      target
    </div>
  );
}

describe('local image drag and drop helpers', () => {
  it('recognizes a browser file drag before files are readable', () => {
    expect(hasLocalFileDrag({ files: null, types: ['Files'] })).toBe(true);
    expect(hasLocalFileDrag({ files: null, types: ['text/plain'] })).toBe(
      false
    );
  });

  it('recognizes file drags from populated FileList-like data', () => {
    const file = new File(['image'], 'reference.png', { type: 'image/png' });
    expect(hasLocalFileDrag({ files: [file] as unknown as FileList })).toBe(
      true
    );
  });

  it('returns all dropped files so the existing importer remains authoritative', () => {
    const image = new File(['image'], 'reference.png', { type: 'image/png' });
    const text = new File(['text'], 'notes.txt', { type: 'text/plain' });
    expect(
      getDroppedFiles({ files: [image, text] as unknown as FileList })
    ).toEqual([image, text]);
  });

  it('imports a local file drop and clears its active state', async () => {
    const onFiles = vi.fn();
    const image = new File(['image'], 'reference.png', { type: 'image/png' });
    const dataTransfer = {
      files: [image] as unknown as FileList,
      types: ['Files'],
      dropEffect: 'none',
    };
    render(<DropTarget onFiles={onFiles} />);
    const target = screen.getByTestId('drop-target');

    fireEvent.dragEnter(target, { dataTransfer });
    expect(target.getAttribute('data-dragging')).toBe('true');

    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([image]));
    expect(target.getAttribute('data-dragging')).toBe('false');
  });

  it('does not import non-file drags or files while disabled', () => {
    const onFiles = vi.fn();
    const image = new File(['image'], 'reference.png', { type: 'image/png' });
    const { rerender } = render(<DropTarget onFiles={onFiles} />);
    const target = screen.getByTestId('drop-target');

    fireEvent.dragEnter(target, {
      dataTransfer: {
        files: [] as unknown as FileList,
        types: ['text/plain'],
      },
    });
    expect(target.getAttribute('data-dragging')).toBe('false');

    rerender(<DropTarget disabled onFiles={onFiles} />);
    fireEvent.drop(target, {
      dataTransfer: {
        files: [image] as unknown as FileList,
        types: ['Files'],
      },
    });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
