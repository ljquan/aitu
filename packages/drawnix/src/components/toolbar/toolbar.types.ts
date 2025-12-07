/**
 * Unified toolbar type definitions
 * @file toolbar.types.ts
 */

/**
 * 统一工具栏容器组件属性
 */
export interface UnifiedToolbarProps {
  /**
   * (可选) 自定义CSS类名
   */
  className?: string;
  /**
   * (可选) 项目抽屉是否打开
   */
  projectDrawerOpen?: boolean;
  /**
   * (可选) 项目抽屉打开/关闭切换回调
   */
  onProjectDrawerToggle?: () => void;
}

/**
 * 工具栏分区通用属性
 * 应用于 AppToolbar, CreationToolbar, ZoomToolbar, ThemeToolbar
 */
export interface ToolbarSectionProps {
  /**
   * 是否嵌入到统一容器中
   * - true: 不应用独立定位样式,作为子组件渲染
   * - false: 应用原有绝对定位样式(移动端使用)
   * @default false
   */
  embedded?: boolean;

  /**
   * 是否处于图标模式
   * - true: 隐藏文本标签,仅显示图标
   * - false: 正常显示图标和文本
   * @default false
   */
  iconMode?: boolean;
}
