/**
 * 光标预览组件
 * 在工具栏旁边显示模拟光标
 */

import React from 'react';

export interface CursorPreviewProps {
  /** 颜色 */
  color: string;
  /** 大小 */
  size: number;
  /** 缩放比例 */
  zoom: number;
}

export const CursorPreview: React.FC<CursorPreviewProps> = ({ color, size, zoom }) => {
  // 应用缩放后的大小，限制范围：最小 4px，最大 256px
  const scaledSize = size * zoom;
  const previewSize = Math.max(4, Math.min(256, scaledSize));
  
  return (
    <div
      className="cursor-preview-dot"
      style={{
        width: previewSize,
        height: previewSize,
        backgroundColor: color,
      }}
    />
  );
};

export default CursorPreview;
