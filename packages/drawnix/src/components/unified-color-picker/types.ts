/**
 * UnifiedColorPicker 类型定义
 */

/** HSV 颜色模型 */
export interface HSVColor {
  /** 色相 0-360 */
  h: number;
  /** 饱和度 0-100 */
  s: number;
  /** 明度 0-100 */
  v: number;
}

/** RGB 颜色模型 */
export interface RGBColor {
  /** 红色 0-255 */
  r: number;
  /** 绿色 0-255 */
  g: number;
  /** 蓝色 0-255 */
  b: number;
}

/** RGBA 颜色模型 */
export interface RGBAColor extends RGBColor {
  /** 透明度 0-1 */
  a: number;
}

/** 预设颜色项 */
export interface PresetColorItem {
  /** 颜色名称 */
  name: string;
  /** 颜色值 (HEX) */
  value: string;
}

/** UnifiedColorPicker 组件 Props */
export interface UnifiedColorPickerProps {
  /** 当前颜色值 (HEX 格式，可带透明度如 #FF0000FF) */
  value?: string;
  /** 颜色变化回调 */
  onChange?: (color: string) => void;
  /** 透明度变化回调 (0-100) */
  onOpacityChange?: (opacity: number) => void;
  /** 是否显示透明度条，默认 true */
  showAlpha?: boolean;
  /** 是否显示吸管工具，默认 true */
  showEyeDropper?: boolean;
  /** 是否显示预设颜色，默认 true */
  showPresets?: boolean;
  /** 是否显示最近使用颜色，默认 true */
  showRecentColors?: boolean;
  /** 是否显示 HEX 输入框，默认 true */
  showHexInput?: boolean;
  /** 自定义预设颜色，不传则使用 CLASSIC_COLORS */
  presetColors?: PresetColorItem[];
  /** 自定义类名 */
  className?: string;
  /** 禁用状态 */
  disabled?: boolean;
}

/** HSPanel 子组件 Props */
export interface HSPanelProps {
  /** 当前色相 0-360 */
  hue: number;
  /** 当前饱和度 0-100 */
  saturation: number;
  /** 当前明度 0-100 */
  value: number;
  /** 饱和度/明度变化回调 */
  onChange: (saturation: number, value: number) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/** HueSlider 子组件 Props */
export interface HueSliderProps {
  /** 当前色相 0-360 */
  hue: number;
  /** 色相变化回调 */
  onChange: (hue: number) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/** AlphaSlider 子组件 Props */
export interface AlphaSliderProps {
  /** 当前透明度 0-100 */
  alpha: number;
  /** 当前颜色 (用于渐变背景) */
  color: string;
  /** 透明度变化回调 */
  onChange: (alpha: number) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/** PresetColors 子组件 Props */
export interface PresetColorsProps {
  /** 预设颜色列表 */
  colors: PresetColorItem[];
  /** 当前选中颜色 */
  selectedColor?: string;
  /** 颜色选择回调 */
  onSelect: (color: string) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/** HexInput 子组件 Props */
export interface HexInputProps {
  /** 当前颜色值 (HEX) */
  value: string;
  /** 当前透明度 0-100 */
  alpha: number;
  /** 颜色变化回调 */
  onColorChange: (color: string) => void;
  /** 透明度变化回调 */
  onAlphaChange: (alpha: number) => void;
  /** 是否显示透明度输入 */
  showAlpha?: boolean;
  /** 禁用状态 */
  disabled?: boolean;
}

/** EyeDropper 子组件 Props */
export interface EyeDropperProps {
  /** 取色成功回调 */
  onPick: (color: string) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/** RecentColors 子组件 Props */
export interface RecentColorsProps {
  /** 最近使用的颜色列表 */
  colors: string[];
  /** 当前选中颜色 */
  selectedColor?: string;
  /** 颜色选择回调 */
  onSelect: (color: string) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/** 最近使用颜色上下文值 */
export interface RecentColorsContextValue {
  /** 最近使用的颜色列表 */
  recentColors: string[];
  /** 添加颜色到最近使用 */
  addRecentColor: (color: string) => void;
  /** 清空最近使用颜色 */
  clearRecentColors: () => void;
}
