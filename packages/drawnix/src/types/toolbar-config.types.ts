/**
 * 工具栏配置类型定义
 * 用于管理工具栏按钮的顺序和显示状态
 */

/**
 * 单个按钮配置
 */
export interface ToolbarButtonConfig {
  /** 按钮唯一标识 */
  id: string;
  /** 是否在主工具栏显示（false 则收起到"更多"面板） */
  visible: boolean;
  /** 显示顺序（数字越小越靠前） */
  order: number;
}

/**
 * 工具栏完整配置
 */
export interface ToolbarConfig {
  /** 所有按钮配置 */
  buttons: ToolbarButtonConfig[];
  /** 配置版本号（用于迁移） */
  version: number;
  /** 最后更新时间 */
  updatedAt: number;
}

/**
 * 当前配置版本
 */
export const TOOLBAR_CONFIG_VERSION = 3;

/**
 * 默认显示的按钮
 * 顺序: 手形、选择、文本、图片上传、素材库、AI图片、AI视频
 */
export const DEFAULT_VISIBLE_BUTTONS = [
  'hand',
  'selection',
  'text',
  'image',
  'media-library',
  'ai-image',
  'ai-video',
];

/**
 * 所有按钮的默认顺序
 */
export const ALL_BUTTON_IDS = [
  // 默认显示的按钮
  'hand',
  'selection',
  'text',
  'image',
  'media-library',
  'ai-image',
  'ai-video',
  // 默认收起的按钮（放在更多工具里）
  'mind',
  'freehand',
  'arrow',
  'shape',
  'theme',
  'mermaid-to-drawnix',
  'markdown-to-drawnix',
  // 操作类按钮（默认收起）
  'undo',
  'redo',
  'zoom', // 缩放工具栏作为整体
];

/**
 * 按钮元数据（用于显示名称和图标）
 */
export interface ToolbarButtonMeta {
  id: string;
  titleKey: string;
  icon: string;
}

/**
 * 获取默认配置
 */
export function getDefaultToolbarConfig(): ToolbarConfig {
  const buttons: ToolbarButtonConfig[] = ALL_BUTTON_IDS.map((id, index) => ({
    id,
    visible: DEFAULT_VISIBLE_BUTTONS.includes(id),
    order: index,
  }));

  return {
    buttons,
    version: TOOLBAR_CONFIG_VERSION,
    updatedAt: Date.now(),
  };
}

/**
 * 根据配置获取可见按钮列表（已排序）
 */
export function getVisibleButtons(config: ToolbarConfig): ToolbarButtonConfig[] {
  return config.buttons
    .filter((btn) => btn.visible)
    .sort((a, b) => a.order - b.order);
}

/**
 * 根据配置获取隐藏按钮列表（已排序）
 */
export function getHiddenButtons(config: ToolbarConfig): ToolbarButtonConfig[] {
  return config.buttons
    .filter((btn) => !btn.visible)
    .sort((a, b) => a.order - b.order);
}

/**
 * 获取按钮配置
 */
export function getButtonConfig(
  config: ToolbarConfig,
  buttonId: string
): ToolbarButtonConfig | undefined {
  return config.buttons.find((btn) => btn.id === buttonId);
}

/**
 * 更新按钮可见性
 */
export function updateButtonVisibility(
  config: ToolbarConfig,
  buttonId: string,
  visible: boolean
): ToolbarConfig {
  const buttons = config.buttons.map((btn) =>
    btn.id === buttonId ? { ...btn, visible } : btn
  );

  return {
    ...config,
    buttons,
    updatedAt: Date.now(),
  };
}

/**
 * 重新排序按钮
 */
export function reorderButtons(
  config: ToolbarConfig,
  fromIndex: number,
  toIndex: number,
  isVisibleList: boolean
): ToolbarConfig {
  const visibleButtons = getVisibleButtons(config);
  const hiddenButtons = getHiddenButtons(config);
  const targetList = isVisibleList ? visibleButtons : hiddenButtons;

  // 移动元素
  const [movedItem] = targetList.splice(fromIndex, 1);
  targetList.splice(toIndex, 0, movedItem);

  // 重新计算 order
  const newButtons = config.buttons.map((btn) => {
    const visibleIndex = visibleButtons.findIndex((v) => v.id === btn.id);
    const hiddenIndex = hiddenButtons.findIndex((h) => h.id === btn.id);

    if (visibleIndex !== -1) {
      return { ...btn, order: visibleIndex };
    } else if (hiddenIndex !== -1) {
      return { ...btn, order: visibleButtons.length + hiddenIndex };
    }
    return btn;
  });

  return {
    ...config,
    buttons: newButtons,
    updatedAt: Date.now(),
  };
}

/**
 * 将按钮从隐藏移动到可见
 */
export function moveButtonToVisible(
  config: ToolbarConfig,
  buttonId: string,
  insertIndex?: number
): ToolbarConfig {
  const visibleButtons = getVisibleButtons(config);
  const targetIndex = insertIndex ?? visibleButtons.length;

  let newButtons = config.buttons.map((btn) =>
    btn.id === buttonId ? { ...btn, visible: true } : btn
  );

  // 重新计算 order
  const newVisibleButtons = newButtons
    .filter((btn) => btn.visible && btn.id !== buttonId)
    .sort((a, b) => a.order - b.order);

  const movedButton = newButtons.find((btn) => btn.id === buttonId)!;
  newVisibleButtons.splice(targetIndex, 0, movedButton);

  const newHiddenButtons = newButtons
    .filter((btn) => !btn.visible)
    .sort((a, b) => a.order - b.order);

  newButtons = newButtons.map((btn) => {
    const visibleIndex = newVisibleButtons.findIndex((v) => v.id === btn.id);
    const hiddenIndex = newHiddenButtons.findIndex((h) => h.id === btn.id);

    if (visibleIndex !== -1) {
      return { ...btn, order: visibleIndex };
    } else if (hiddenIndex !== -1) {
      return { ...btn, order: newVisibleButtons.length + hiddenIndex };
    }
    return btn;
  });

  return {
    ...config,
    buttons: newButtons,
    updatedAt: Date.now(),
  };
}

/**
 * 将按钮从可见移动到隐藏
 */
export function moveButtonToHidden(
  config: ToolbarConfig,
  buttonId: string
): ToolbarConfig {
  let newButtons = config.buttons.map((btn) =>
    btn.id === buttonId ? { ...btn, visible: false } : btn
  );

  // 重新计算 order
  const newVisibleButtons = newButtons
    .filter((btn) => btn.visible)
    .sort((a, b) => a.order - b.order);

  const newHiddenButtons = newButtons
    .filter((btn) => !btn.visible)
    .sort((a, b) => a.order - b.order);

  newButtons = newButtons.map((btn) => {
    const visibleIndex = newVisibleButtons.findIndex((v) => v.id === btn.id);
    const hiddenIndex = newHiddenButtons.findIndex((h) => h.id === btn.id);

    if (visibleIndex !== -1) {
      return { ...btn, order: visibleIndex };
    } else if (hiddenIndex !== -1) {
      return { ...btn, order: newVisibleButtons.length + hiddenIndex };
    }
    return btn;
  });

  return {
    ...config,
    buttons: newButtons,
    updatedAt: Date.now(),
  };
}
