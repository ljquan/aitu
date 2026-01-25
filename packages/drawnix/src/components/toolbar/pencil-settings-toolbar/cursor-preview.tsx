/**
 * 光标预览组件
 * 在工具栏旁边显示模拟光标
 */

import React from 'react';
import { BrushShape } from '../../../plugins/freehand/freehand-settings';

export interface CursorPreviewProps {
  /** 颜色 */
  color: string;
  /** 大小 */
  size: number;
  /** 缩放比例 */
  zoom: number;
  /** 形状（可选，默认圆形） */
  shape?: BrushShape;
}

export const CursorPreview: React.FC<CursorPreviewProps> = ({ 
  color, 
  size, 
  zoom,
  shape = BrushShape.circle 
}) => {
  // 应用缩放后的大小，限制范围：最小 4px，最大 256px
  const scaledSize = size * zoom;
  const previewSize = Math.max(4, Math.min(256, scaledSize));
  
  // 根据形状决定圆角
  const borderRadius = shape === BrushShape.circle ? '50%' : '0';
  
  return (
    <div
      className="cursor-preview-dot"
      style={{
        width: previewSize,
        height: previewSize,
        backgroundColor: color,
        borderRadius,
      }}
    />
  );
};

export default CursorPreview;
