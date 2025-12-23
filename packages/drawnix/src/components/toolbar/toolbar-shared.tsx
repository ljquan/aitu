/**
 * Toolbar Shared Components and Utilities
 * 
 * 工具栏共享的组件、常量和工具函数
 */

import { PlaitPointerType, ThemeColorMode } from '@plait/core';
import { Translations } from '../../i18n';

/**
 * 主题选项配置
 */
export const THEME_OPTIONS: { value: ThemeColorMode; labelKey: keyof Translations }[] = [
  { value: ThemeColorMode.default, labelKey: 'theme.default' },
  { value: ThemeColorMode.colorful, labelKey: 'theme.colorful' },
  { value: ThemeColorMode.soft, labelKey: 'theme.soft' },
  { value: ThemeColorMode.retro, labelKey: 'theme.retro' },
  { value: ThemeColorMode.dark, labelKey: 'theme.dark' },
  { value: ThemeColorMode.starry, labelKey: 'theme.starry' },
];

/**
 * 选中状态的勾选图标
 */
export const CheckIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: '1rem', height: '1rem' }}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * 判断是否为基础指针类型（手型或选择）
 */
export const isBasicPointer = (pointer: string): boolean => {
  return (
    pointer === PlaitPointerType.hand || pointer === PlaitPointerType.selection
  );
};

/**
 * 空白占位图标（用于未选中状态时保持对齐）
 */
export const EmptyIcon = <span style={{ width: '1rem', display: 'inline-block' }} />;
