/**
 * 图片宽高比配置
 */

export interface AspectRatioOption {
  label: string; // 显示标签 "16:9"
  value: string; // 值 "16:9"
  width: number; // 宽度比例 16
  height: number; // 高度比例 9
  description: string; // 描述 "横屏全屏"
}

/**
 * 自动比例选项（模型根据提示词自动决定）
 */
export const AUTO_ASPECT_RATIO: AspectRatioOption = {
  label: '自动',
  value: 'auto',
  width: 0,
  height: 0,
  description: '由模型自动决定最佳比例',
};

/**
 * 支持的图片宽高比选项
 */
export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  AUTO_ASPECT_RATIO,
  { label: '1:1', value: '1:1', width: 1, height: 1, description: '正方形' },
  { label: '2:3', value: '2:3', width: 2, height: 3, description: '竖版标准' },
  { label: '3:2', value: '3:2', width: 3, height: 2, description: '横版标准' },
  { label: '3:4', value: '3:4', width: 3, height: 4, description: '竖版' },
  { label: '4:3', value: '4:3', width: 4, height: 3, description: '横版' },
  { label: '4:5', value: '4:5', width: 4, height: 5, description: '竖版社交' },
  { label: '5:4', value: '5:4', width: 5, height: 4, description: '横版' },
  {
    label: '9:16',
    value: '9:16',
    width: 9,
    height: 16,
    description: '竖屏全屏',
  },
  {
    label: '16:9',
    value: '16:9',
    width: 16,
    height: 9,
    description: '横屏全屏',
  },
  { label: '21:9', value: '21:9', width: 21, height: 9, description: '超宽屏' },
];

/**
 * 默认宽高比（自动）
 */
export const DEFAULT_ASPECT_RATIO = 'auto';

/**
 * 根据宽高比值获取配置
 */
export function getAspectRatioOption(
  value: string
): AspectRatioOption | undefined {
  return ASPECT_RATIO_OPTIONS.find((option) => option.value === value);
}

/**
 * 根据宽高比计算实际尺寸
 * @param aspectRatio 宽高比值，如 "16:9"
 * @param baseSize 基础尺寸（较小边的像素数）
 * @returns 计算后的宽高
 */
export function calculateDimensions(
  aspectRatio: string,
  baseSize: number = 1024
): { width: number; height: number } {
  const option = getAspectRatioOption(aspectRatio);
  if (!option) {
    return { width: baseSize, height: baseSize };
  }

  const { width: ratioW, height: ratioH } = option;

  if (ratioW >= ratioH) {
    // 横版或正方形，以高度为基准
    return {
      width: Math.round(baseSize * (ratioW / ratioH)),
      height: baseSize,
    };
  } else {
    // 竖版，以宽度为基准
    return {
      width: baseSize,
      height: Math.round(baseSize * (ratioH / ratioW)),
    };
  }
}

/**
 * 将 aspectRatio 转换为生成 API 期望的 size 令牌
 */
export function convertAspectRatioToSize(
  aspectRatio?: string
): string | undefined {
  if (!aspectRatio || aspectRatio === 'auto') {
    return undefined;
  }

  const ratioMap: Record<string, string> = {
    '1:1': '1x1',
    '2:3': '2x3',
    '3:2': '3x2',
    '3:4': '3x4',
    '4:3': '4x3',
    '4:5': '4x5',
    '5:4': '5x4',
    '9:16': '9x16',
    '16:9': '16x9',
    '21:9': '21x9',
  };

  return ratioMap[aspectRatio];
}
