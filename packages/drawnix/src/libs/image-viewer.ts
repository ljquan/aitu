/**
 * ImageViewer Class
 *
 * 基于 ViewerJS 封装的图片查看器类
 * 用于非 React 环境（如 Plait 插件）
 *
 * 功能：
 * - 缩放（鼠标滚轮、按钮、键盘 +/-）
 * - 拖拽移动图片
 * - 旋转、翻转
 * - 重置（键盘 0）
 * - ESC 关闭
 */

import Viewer from 'viewerjs';
import 'viewerjs/dist/viewer.css';

export interface ImageViewerOptions {
  zoomStep?: number;
  minZoom?: number;
  maxZoom?: number;
  enableKeyboard?: boolean;
}

// 检测是否为移动设备
const isMobileDevice = (): boolean => {
  return window.innerWidth <= 768 || 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export class ImageViewer {
  private options: Required<ImageViewerOptions>;
  private viewer: Viewer | null = null;
  private container: HTMLDivElement | null = null;

  constructor(options: ImageViewerOptions = {}) {
    this.options = {
      zoomStep: options.zoomStep || 0.2,
      minZoom: options.minZoom || 0.1,
      maxZoom: options.maxZoom || 5,
      enableKeyboard: options.enableKeyboard !== false,
    };
  }

  /**
   * 打开图片查看器
   * @param src 图片 URL
   * @param alt 图片描述
   */
  open(src: string, alt = ''): void {
    // 如果已有查看器打开，先关闭
    this.close();

    // 创建隐藏的图片容器
    this.container = document.createElement('div');
    this.container.style.display = 'none';

    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    this.container.appendChild(img);
    document.body.appendChild(this.container);

    // 移动端使用精简的 toolbar
    const isMobile = isMobileDevice();
    const toolbar = isMobile ? {
      zoomIn: 1,
      zoomOut: 1,
      oneToOne: 0,
      reset: 1,
      prev: 0,
      play: 0,
      next: 0,
      rotateLeft: 1,
      rotateRight: 1,
      flipHorizontal: 0,
      flipVertical: 0,
    } : {
      zoomIn: 1,
      zoomOut: 1,
      oneToOne: 1,
      reset: 1,
      prev: 0,
      play: 0,
      next: 0,
      rotateLeft: 1,
      rotateRight: 1,
      flipHorizontal: 1,
      flipVertical: 1,
    };

    // 创建 ViewerJS 实例
    this.viewer = new Viewer(this.container, {
      inline: false,
      button: true,
      navbar: false,
      title: !!alt,
      toolbar,
      fullscreen: !isMobile, // 移动端禁用全屏按钮
      keyboard: this.options.enableKeyboard,
      backdrop: true,
      loading: true,
      loop: false,
      minZoomRatio: this.options.minZoom,
      maxZoomRatio: this.options.maxZoom,
      zoomRatio: this.options.zoomStep,
      hidden: () => {
        // 当查看器隐藏时清理资源
        this.cleanup();
      },
    });

    // 显示查看器
    this.viewer.show();
  }

  /**
   * 关闭图片查看器
   */
  close(): void {
    if (this.viewer) {
      this.viewer.hide();
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    this.close();
    this.cleanup();
  }
}
