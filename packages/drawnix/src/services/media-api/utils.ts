/**
 * Media API 工具函数
 *
 * 通用的 API 请求辅助函数，SW 和主线程共用
 */

/**
 * 异步图片模型 ID 列表
 */
const ASYNC_IMAGE_MODELS = [
  'gemini-3-pro-image-preview-async',
  'gemini-3-pro-image-preview-2k-async',
  'gemini-3-pro-image-preview-4k-async',
];

/**
 * 检测是否为异步图片模型
 */
export function isAsyncImageModel(model?: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return ASYNC_IMAGE_MODELS.some((m) => lower.includes(m));
}

/**
 * 规范化 API base URL，移除尾部 / 或 /v1
 * 便于统一拼接 /v1/videos 等路径
 */
export function normalizeApiBase(url: string): string {
  let base = url.replace(/\/+$/, '');
  if (base.endsWith('/v1')) {
    base = base.slice(0, -3);
  }
  return base;
}

/**
 * 从 URL 中提取文件扩展名
 */
export function getExtensionFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0];
    const last = clean.split('.').pop();
    if (last && last.length <= 5) {
      return last.toLowerCase();
    }
  } catch {
    // ignore
  }
  return 'jpg';
}

/**
 * 将尺寸字符串转换为宽高比
 * 例如：'1024x1024' -> '1:1', '1920x1080' -> '16:9'
 */
export function sizeToAspectRatio(size?: string): string | undefined {
  if (!size || !size.includes('x')) return undefined;
  const [wStr, hStr] = size.split('x');
  const w = Number(wStr);
  const h = Number(hStr);
  if (!w || !h) return undefined;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

/**
 * 宽高比到像素尺寸的映射表
 */
const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  '1x1': '1024x1024',
  '16x9': '1792x1024',
  '9x16': '1024x1792',
  '4x3': '1536x1152',
  '3x4': '1152x1536',
  '3x2': '1536x1024',
  '2x3': '1024x1536',
  '4x5': '1024x1280',
  '5x4': '1280x1024',
  '21x9': '1792x768',
};

/**
 * 将宽高比转换为像素尺寸
 * @param aspectRatio 宽高比字符串，如 '1:1', '16:9', '1x1'
 * @returns 像素尺寸字符串，如 '1024x1024'
 */
export function aspectRatioToSize(aspectRatio?: string): string | undefined {
  if (!aspectRatio || aspectRatio === 'auto') {
    return undefined;
  }

  // 支持冒号和 x 两种格式
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

  const normalized = ratioMap[aspectRatio] || aspectRatio;
  return ASPECT_RATIO_TO_SIZE[normalized] || aspectRatio;
}

/**
 * 从消息数组中提取 prompt 用于日志记录
 */
export function extractPromptFromMessages(
  messages: Array<{ role: string; content: unknown }>
): string {
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        return msg.content.substring(0, 500);
      }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            return part.text.substring(0, 500);
          }
        }
      }
    }
  }
  return '';
}

/**
 * 解析尺寸字符串
 * @param sizeStr 尺寸字符串，格式为 'WIDTHxHEIGHT'，如 '1280x720'
 * @returns 解析后的宽高对象，如果格式无效返回 null
 */
export function parseSize(sizeStr: string): { width: number; height: number } | null {
  if (!sizeStr) return null;
  const match = sizeStr.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  };
}

/**
 * 解析错误消息
 */
export function parseErrorMessage(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.error === 'string') return e.error;
    if (e.error && typeof e.error === 'object') {
      const inner = e.error as Record<string, unknown>;
      if (typeof inner.message === 'string') return inner.message;
    }
  }
  return String(error);
}

/**
 * 等待指定时间，支持取消
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const id = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    }
  });
}
