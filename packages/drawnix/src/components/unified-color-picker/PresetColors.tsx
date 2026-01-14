/**
 * 预设颜色组件
 * 以圆点形式展示预设颜色，支持快速选择
 */

import React from 'react';
import classNames from 'classnames';
import type { PresetColorsProps } from './types';
import { isNoColor, NO_COLOR } from '@aitu/utils';
import { removeAlphaFromHex, isLightColor } from './utils';

export const PresetColors: React.FC<PresetColorsProps> = ({
  colors,
  selectedColor,
  onSelect,
  disabled = false,
}) => {
  // 标准化选中颜色用于比较
  const normalizedSelected = selectedColor
    ? removeAlphaFromHex(selectedColor).toUpperCase()
    : '';

  return (
    <div className="ucp-preset-colors">
      {colors.map((color, index) => {
        const isNoColorValue = isNoColor(color.value);
        const normalizedValue = removeAlphaFromHex(color.value).toUpperCase();
        const isSelected = normalizedSelected === normalizedValue;
        const isLight = !isNoColorValue && isLightColor(color.value);

        return (
          <button
            key={`${color.value}-${index}`}
            className={classNames('ucp-preset-colors__item', {
              'ucp-preset-colors__item--selected': isSelected,
              'ucp-preset-colors__item--no-color': isNoColorValue,
              'ucp-preset-colors__item--light': isLight,
            })}
            style={{
              backgroundColor: isNoColorValue ? 'transparent' : color.value,
            }}
            title={color.name}
            disabled={disabled}
            onClick={() => onSelect(color.value)}
          >
            {/* 无颜色图标 */}
            {isNoColorValue && (
              <svg className="ucp-preset-colors__no-color-icon" viewBox="0 0 24 24">
                <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
            {/* 选中指示器 */}
            {isSelected && !isNoColorValue && (
              <svg className="ucp-preset-colors__check-icon" viewBox="0 0 24 24">
                <path
                  d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PresetColors;
