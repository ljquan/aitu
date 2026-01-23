/**
 * 图片编辑内容组件
 * 嵌入到 UnifiedMediaViewer 中的编辑器（复用 ImageEditorCore）
 */

import React, { forwardRef } from 'react';
import {
  ImageEditorCore,
  ImageEditorCoreRef,
  ImageEditState,
} from '../../image-editor/ImageEditorCore';

export type { ImageEditState };

export interface ImageEditorContentProps {
  /** 图片 URL */
  imageUrl: string;
  /** 是否显示覆盖选项 */
  showOverwrite?: boolean;
  /** 覆盖原图回调 */
  onOverwrite?: (editedImageUrl: string) => void;
  /** 插入到画布回调 */
  onInsert?: (editedImageUrl: string) => void;
}

export interface ImageEditorContentRef {
  /** 重置编辑状态 */
  reset: () => void;
  /** 触发保存流程 */
  save: () => void;
  /** 是否有修改 */
  hasChanges: () => boolean;
  /** 获取当前编辑状态 */
  getState: () => ImageEditState;
  /** 设置编辑状态 */
  setState: (state: ImageEditState) => void;
}

export const ImageEditorContent = forwardRef<
  ImageEditorContentRef,
  ImageEditorContentProps
>(({ imageUrl, showOverwrite = false, onOverwrite, onInsert }, ref) => {
  return (
    <ImageEditorCore
      ref={ref}
      imageUrl={imageUrl}
      showOverwrite={showOverwrite}
      onOverwrite={onOverwrite}
      onInsert={onInsert}
      className="embedded-editor"
    />
  );
});

ImageEditorContent.displayName = 'ImageEditorContent';

export default ImageEditorContent;
