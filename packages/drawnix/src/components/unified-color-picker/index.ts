/**
 * UnifiedColorPicker 统一取色器组件导出
 */

export { UnifiedColorPicker } from './UnifiedColorPicker';
export { default } from './UnifiedColorPicker';

// 子组件导出
export { HSPanel } from './HSPanel';
export { HueSlider } from './HueSlider';
export { AlphaSlider } from './AlphaSlider';
export { PresetColors } from './PresetColors';
export { HexInput } from './HexInput';
export { EyeDropper, isEyeDropperSupported } from './EyeDropper';

// Context 导出
export { RecentColorsProvider, useRecentColors, RecentColorsContext } from './RecentColorsContext';

// 类型导出
export type {
  UnifiedColorPickerProps,
  HSPanelProps,
  HueSliderProps,
  AlphaSliderProps,
  PresetColorsProps,
  HexInputProps,
  EyeDropperProps,
  RecentColorsProps,
  RecentColorsContextValue,
  HSVColor,
  RGBColor,
  RGBAColor,
  PresetColorItem,
} from './types';

// 工具函数导出
export {
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
  hsvToHex,
  hexToHsv,
  getAlphaFromHex,
  setAlphaToHex,
  removeAlphaFromHex,
  isValidHex,
  normalizeHex,
  getLuminance,
  isLightColor,
} from './utils';
