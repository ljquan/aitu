/**
 * 图片编辑器组件（独立模态框）
 * 包装 ImageEditorCore，提供全屏模态框体验
 */

import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z_INDEX } from '../../constants/z-index';
import { ImageEditorProps } from './types';
import { ImageEditorCore, ImageEditorCoreRef } from './ImageEditorCore';
import './ImageEditor.scss';

export const ImageEditor: React.FC<ImageEditorProps> = ({
  visible,
  imageUrl,
  onClose,
  onSave,
  onOverwrite,
  onInsert,
  showOverwrite = false,
}) => {
  const editorRef = useRef<ImageEditorCoreRef>(null);

  // 重置状态当编辑器关闭时
  useEffect(() => {
    if (!visible) {
      editorRef.current?.reset();
    }
  }, [visible]);

  if (!visible) return null;

  const content = (
    <div className="image-editor" style={{ zIndex: Z_INDEX.DIALOG_AI_IMAGE }}>
      <div className="image-editor__backdrop" onClick={onClose} />
      <div className="image-editor__container">
        <ImageEditorCore
          ref={editorRef}
          imageUrl={imageUrl}
          showOverwrite={showOverwrite}
          onOverwrite={onOverwrite}
          onInsert={onInsert}
          onClose={onClose}
          onSave={onSave}
        />
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ImageEditor;
