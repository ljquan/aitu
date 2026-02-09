/**
 * Frame 尺寸匹配工具函数
 *
 * 当用户选中 Frame 时，自动匹配最接近的 AI 生成尺寸选项。
 * 支持两种格式：
 * - AI Input Bar 的 size 参数格式（如 "16x9"）
 * - TTD Dialog 的 aspectRatio 格式（如 "16:9"）
 */

import { ASPECT_RATIO_OPTIONS } from '../constants/image-aspect-ratios';
import { getSizeOptionsForModel } from '../constants/model-config';

/**
 * 计算两个比例之间的相似度（越小越相似）
 * 使用对数差来避免不对称性（如 2:1 和 1:2 与 1:1 的距离应该相同）
 */
function ratioDistance(a: number, b: number): number {
  return Math.abs(Math.log(a) - Math.log(b));
}

/**
 * 根据 Frame 的宽高，匹配 AI Input Bar 中最接近的 size 参数值。
 *
 * @param frameWidth Frame 宽度
 * @param frameHeight Frame 高度
 * @param modelId 当前选中的模型 ID（用于获取该模型支持的尺寸选项）
 * @returns 匹配到的 size 值（如 "16x9"），如果没有匹配则返回 undefined
 */
export function matchFrameSizeForModel(
  frameWidth: number,
  frameHeight: number,
  modelId: string
): string | undefined {
  if (frameWidth <= 0 || frameHeight <= 0) return undefined;

  const frameRatio = frameWidth / frameHeight;
  const sizeOptions = getSizeOptionsForModel(modelId);

  if (sizeOptions.length === 0) return undefined;

  // 过滤掉 'auto'
  const validOptions = sizeOptions.filter((opt) => opt.value !== 'auto');
  if (validOptions.length === 0) return undefined;

  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const option of validOptions) {
    // 解析 "16x9" 格式
    const parts = option.value.split('x');
    if (parts.length !== 2) continue;

    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (isNaN(w) || isNaN(h) || h === 0) continue;

    const optionRatio = w / h;
    const distance = ratioDistance(frameRatio, optionRatio);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = option.value;
    }
  }

  // 阈值：如果差距太大（超过 ~30%），不自动匹配，保持 auto
  if (bestDistance > 0.25) return undefined;

  return bestMatch;
}

/**
 * 根据 Frame 的宽高，匹配 TTD Dialog 中最接近的 aspectRatio 值。
 *
 * @param frameWidth Frame 宽度
 * @param frameHeight Frame 高度
 * @returns 匹配到的 aspectRatio 值（如 "16:9"），如果没有匹配则返回 undefined
 */
export function matchFrameAspectRatio(
  frameWidth: number,
  frameHeight: number
): string | undefined {
  if (frameWidth <= 0 || frameHeight <= 0) return undefined;

  const frameRatio = frameWidth / frameHeight;

  // 从 ASPECT_RATIO_OPTIONS 中过滤掉 'auto'
  const validOptions = ASPECT_RATIO_OPTIONS.filter(
    (opt) => opt.value !== 'auto' && opt.width > 0 && opt.height > 0
  );

  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const option of validOptions) {
    const optionRatio = option.width / option.height;
    const distance = ratioDistance(frameRatio, optionRatio);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = option.value;
    }
  }

  // 阈值：如果差距太大，不自动匹配
  if (bestDistance > 0.25) return undefined;

  return bestMatch;
}
