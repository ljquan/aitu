/**
 * 渐变填充面板组件
 * Gradient Fill Panel Component
 * 
 * 使用公共的 GradientEditor 组件
 */

import React from 'react';
import { GradientEditor } from '../gradient-editor';
import type { GradientFillConfig } from '../../types/fill.types';
import { DEFAULT_LINEAR_GRADIENT } from '../../types/fill.types';

export interface GradientFillPanelProps {
  value?: GradientFillConfig;
  onChange?: (config: GradientFillConfig) => void;
}

export const GradientFillPanel: React.FC<GradientFillPanelProps> = ({
  value,
  onChange,
}) => {
  return (
    <GradientEditor
      value={value || DEFAULT_LINEAR_GRADIENT}
      onChange={onChange}
      showPresets={true}
      showHistory={true}
    />
  );
};

export default GradientFillPanel;
