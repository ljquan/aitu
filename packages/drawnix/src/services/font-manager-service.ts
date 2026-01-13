/**
 * 字体管理服务
 * Font Manager Service
 *
 * 功能：
 * 1. 字体加载（使用 link 标签，由 Service Worker 自动缓存）
 * 2. 画布初始化时加载已使用的字体
 * 3. 字体预览图管理
 */

import { GOOGLE_FONTS, SYSTEM_FONTS } from '../constants/text-effects';
import type { FontConfig } from '../types/text-effects.types';

// 字体加载状态
type FontLoadStatus = 'pending' | 'loading' | 'loaded' | 'error';

interface FontLoadState {
  status: FontLoadStatus;
  promise?: Promise<void>;
  error?: Error;
}

class FontManagerService {
  // 字体加载状态缓存
  private fontLoadStates = new Map<string, FontLoadState>();

  // 已加载的字体集合
  private loadedFonts = new Set<string>();

  // 字体预览图 URL 映射
  private fontPreviewUrls = new Map<string, string>();

  /**
   * 加载 Google Font（使用 link 标签，Service Worker 自动缓存）
   */
  async loadGoogleFont(family: string, weights: number[] = [400, 700]): Promise<void> {
    // 检查缓存状态
    const cached = this.fontLoadStates.get(family);
    if (cached) {
      if (cached.status === 'loaded') {
        return Promise.resolve();
      }
      if (cached.status === 'loading' && cached.promise) {
        return cached.promise;
      }
      if (cached.status === 'error' && cached.error) {
        throw cached.error;
      }
    }

    // 标记为加载中
    const loadPromise = this._loadGoogleFontInternal(family, weights);
    this.fontLoadStates.set(family, {
      status: 'loading',
      promise: loadPromise,
    });

    try {
      await loadPromise;
      this.fontLoadStates.set(family, { status: 'loaded' });
      this.loadedFonts.add(family);
    } catch (error) {
      const err = error as Error;
      this.fontLoadStates.set(family, {
        status: 'error',
        error: err,
      });
      throw err;
    }
  }

  /**
   * 使用 link 标签加载 Google Font
   * Service Worker 会自动缓存字体文件（基于 URL）
   */
  private _loadGoogleFontInternal(family: string, weights: number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const linkId = `google-font-${family.replace(/\s+/g, '-').toLowerCase()}`;

      // 检查是否已存在 link 标签
      const existingLink = document.getElementById(linkId);
      if (existingLink) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      // Google Fonts CSS URL - Service Worker 会缓存这个 CSS 文件
      // CSS 中引用的字体文件 URL 也会被 Service Worker 缓存
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(';')}&display=swap`;

      link.onload = () => {
        // 等待字体真正加载完成
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => resolve());
        } else {
          // 降级方案：延迟一段时间
          setTimeout(() => resolve(), 100);
        }
      };
      link.onerror = () => reject(new Error(`Failed to load font: ${family}`));

      document.head.appendChild(link);
    });
  }

  /**
   * 检查字体是否已加载
   */
  isFontLoaded(family: string): boolean {
    return this.loadedFonts.has(family);
  }

  /**
   * 获取字体加载状态
   */
  getFontLoadStatus(family: string): FontLoadStatus {
    return this.fontLoadStates.get(family)?.status || 'pending';
  }

  /**
   * 从画布数据中提取使用的字体
   */
  extractFontsFromBoard(boardData: any): string[] {
    const fonts = new Set<string>();

    const traverse = (node: any) => {
      if (!node) return;

      // 检查节点的 font-family 属性
      if (node['font-family']) {
        fonts.add(node['font-family']);
      }

      // 检查 style 字符串中的 font-family
      if (typeof node.style === 'string') {
        const fontFamilyMatch = node.style.match(/font-family:\s*["']?([^;"']+)["']?/);
        if (fontFamilyMatch && fontFamilyMatch[1]) {
          const fontFamily = fontFamilyMatch[1].trim().replace(/['"]/g, '');
          fonts.add(fontFamily);
        }
      }

      // 检查 text.children（Plait 文本元素的结构）
      if (node.text && Array.isArray(node.text.children)) {
        node.text.children.forEach((child: any) => {
          if (child['font-family']) {
            fonts.add(child['font-family']);
          }
          traverse(child);
        });
      }

      // 检查普通的 children
      if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
          if (child['font-family']) {
            fonts.add(child['font-family']);
          }
          // 递归检查子节点的 style
          if (typeof child.style === 'string') {
            const fontFamilyMatch = child.style.match(/font-family:\s*["']?([^;"']+)["']?/);
            if (fontFamilyMatch && fontFamilyMatch[1]) {
              const fontFamily = fontFamilyMatch[1].trim().replace(/['"]/g, '');
              fonts.add(fontFamily);
            }
          }
          traverse(child);
        });
      }
    };

    if (Array.isArray(boardData)) {
      boardData.forEach(traverse);
    } else {
      traverse(boardData);
    }

    return Array.from(fonts);
  }

  /**
   * 预加载画布中使用的所有字体
   */
  async preloadBoardFonts(boardData: any): Promise<void> {
    const fonts = this.extractFontsFromBoard(boardData);
    const googleFonts = fonts.filter(font =>
      GOOGLE_FONTS.some(gf => gf.family === font)
    );

    // 并行加载所有 Google Fonts
    await Promise.allSettled(
      googleFonts.map(font => this.loadGoogleFont(font))
    );
  }

  /**
   * 获取字体预览图 URL
   */
  getFontPreviewUrl(family: string): string | null {
    return this.fontPreviewUrls.get(family) || null;
  }

  /**
   * 设置字体预览图 URL
   */
  setFontPreviewUrl(family: string, url: string): void {
    this.fontPreviewUrls.set(family, url);
  }

  /**
   * 生成字体预览图（使用 Canvas）
   */
  async generateFontPreview(
    family: string,
    text: string = '元旦快乐 Happy New Year',
    options: {
      width?: number;
      height?: number;
      fontSize?: number;
      backgroundColor?: string;
      textColor?: string;
    } = {}
  ): Promise<string> {
    const {
      width = 200,
      height = 60,
      fontSize = 24,
      backgroundColor = '#ffffff',
      textColor = '#000000',
    } = options;

    // 检查缓存
    const cached = this.fontPreviewUrls.get(family);
    if (cached) {
      return cached;
    }

    // 确保字体已加载
    const fontConfig = [...GOOGLE_FONTS, ...SYSTEM_FONTS].find(f => f.family === family);
    if (fontConfig?.source === 'google' && !this.isFontLoaded(family)) {
      await this.loadGoogleFont(family);
    }

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // 绘制背景
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // 绘制文本
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px '${family}', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    // 转换为 Data URL
    const dataUrl = canvas.toDataURL('image/png');

    // 缓存
    this.fontPreviewUrls.set(family, dataUrl);

    return dataUrl;
  }

  /**
   * 批量生成字体预览图
   */
  async generateAllFontPreviews(): Promise<void> {
    const allFonts = [...GOOGLE_FONTS, ...SYSTEM_FONTS];

    // 先加载所有 Google Fonts
    const googleFonts = allFonts.filter(f => f.source === 'google');
    await Promise.allSettled(
      googleFonts.map(f => this.loadGoogleFont(f.family))
    );

    // 生成预览图
    await Promise.allSettled(
      allFonts.map(font =>
        this.generateFontPreview(font.family, font.previewText)
      )
    );
  }

  /**
   * 清除字体缓存（仅清除内存状态，Service Worker 缓存由浏览器管理）
   */
  clearCache(): void {
    this.fontLoadStates.clear();
    this.loadedFonts.clear();
    this.fontPreviewUrls.clear();
  }

  /**
   * 获取所有已加载的字体
   */
  getLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }
}

// 导出单例
export const fontManagerService = new FontManagerService();
