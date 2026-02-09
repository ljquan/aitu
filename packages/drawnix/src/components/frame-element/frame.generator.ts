/**
 * Frame 元素渲染生成器
 *
 * 在 SVG 画布上渲染 Frame 容器（虚线矩形 + 可选背景图 + 标题标签）
 */
import { RectangleClient } from '@plait/core';
import { PlaitFrame } from '../../types/frame.types';

export const FRAME_STROKE_COLOR = '#a0a0a0';
export const FRAME_FILL_COLOR = 'rgba(200, 200, 200, 0.04)';
export const FRAME_TITLE_FONT_SIZE = 12;
export const FRAME_TITLE_PADDING = 8;
export const FRAME_TITLE_OFFSET_Y = -6;
/** 标题区域估算高度（font-size + padding） */
export const FRAME_TITLE_HEIGHT = FRAME_TITLE_FONT_SIZE + 4;

export class FrameGenerator {
  private rectElement: SVGRectElement | null = null;
  private titleText: SVGTextElement | null = null;
  private titleBg: SVGRectElement | null = null;
  /** 背景图相关 SVG 元素 */
  private bgClipPath: SVGClipPathElement | null = null;
  private bgImage: SVGImageElement | null = null;
  private bgDefs: SVGDefsElement | null = null;
  private currentBgUrl: string | undefined = undefined;

  processDrawing(element: PlaitFrame, parentG: SVGGElement): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'frame-element');
    parentG.appendChild(g);

    const rect = RectangleClient.getRectangleByPoints(element.points);

    // 虚线矩形边框
    this.rectElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.rectElement.setAttribute('x', String(rect.x));
    this.rectElement.setAttribute('y', String(rect.y));
    this.rectElement.setAttribute('width', String(rect.width));
    this.rectElement.setAttribute('height', String(rect.height));
    this.rectElement.setAttribute('rx', '8');
    this.rectElement.setAttribute('ry', '8');
    this.rectElement.setAttribute('fill', FRAME_FILL_COLOR);
    this.rectElement.setAttribute('stroke', FRAME_STROKE_COLOR);
    this.rectElement.setAttribute('stroke-width', '1.5');
    this.rectElement.setAttribute('stroke-dasharray', '8 4');
    g.appendChild(this.rectElement);

    // 背景图（如果有）
    if (element.backgroundUrl) {
      this.createBackgroundImage(g, element, rect);
    }

    // 标题背景
    this.titleBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    g.appendChild(this.titleBg);

    // 标题文本
    this.titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    this.titleText.setAttribute('x', String(rect.x + FRAME_TITLE_PADDING));
    this.titleText.setAttribute('y', String(rect.y + FRAME_TITLE_OFFSET_Y));
    this.titleText.setAttribute('font-size', String(FRAME_TITLE_FONT_SIZE));
    this.titleText.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    this.titleText.setAttribute('fill', FRAME_STROKE_COLOR);
    this.titleText.setAttribute('dominant-baseline', 'auto');
    this.titleText.textContent = element.name || 'Frame';
    g.appendChild(this.titleText);

    // 计算标题背景尺寸
    this.updateTitleBackground(rect.x, rect.y);

    return g;
  }

  updateDrawing(element: PlaitFrame, g: SVGGElement): void {
    const rect = RectangleClient.getRectangleByPoints(element.points);

    if (this.rectElement) {
      this.rectElement.setAttribute('x', String(rect.x));
      this.rectElement.setAttribute('y', String(rect.y));
      this.rectElement.setAttribute('width', String(rect.width));
      this.rectElement.setAttribute('height', String(rect.height));
    }

    // 更新背景图
    if (element.backgroundUrl !== this.currentBgUrl) {
      if (element.backgroundUrl) {
        if (this.bgImage) {
          // 更新现有背景图 URL
          this.updateBackgroundImage(element, rect);
        } else {
          // 新增背景图（插入到 rectElement 之后，titleBg 之前）
          this.createBackgroundImage(g, element, rect);
        }
      } else {
        // 移除背景图
        this.removeBackgroundImage();
      }
    } else if (this.bgImage) {
      // URL 没变但可能位置/尺寸变了
      this.updateBackgroundImage(element, rect);
    }

    if (this.titleText) {
      this.titleText.setAttribute('x', String(rect.x + FRAME_TITLE_PADDING));
      this.titleText.setAttribute('y', String(rect.y + FRAME_TITLE_OFFSET_Y));
      this.titleText.textContent = element.name || 'Frame';
    }

    this.updateTitleBackground(rect.x, rect.y);
  }

  /**
   * 创建背景图 SVG 元素（clipPath + image）
   */
  private createBackgroundImage(
    g: SVGGElement,
    element: PlaitFrame,
    rect: RectangleClient
  ): void {
    const clipId = `frame-bg-clip-${element.id}`;

    // 创建 <defs> 用于 clipPath
    this.bgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.bgClipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    this.bgClipPath.setAttribute('id', clipId);

    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', String(rect.x));
    clipRect.setAttribute('y', String(rect.y));
    clipRect.setAttribute('width', String(rect.width));
    clipRect.setAttribute('height', String(rect.height));
    clipRect.setAttribute('rx', '8');
    clipRect.setAttribute('ry', '8');
    this.bgClipPath.appendChild(clipRect);
    this.bgDefs.appendChild(this.bgClipPath);

    // 插入到 g 的最前面（在 rectElement 之后）
    if (this.rectElement && this.rectElement.nextSibling) {
      g.insertBefore(this.bgDefs, this.rectElement.nextSibling);
    } else {
      g.appendChild(this.bgDefs);
    }

    // 创建 <image> 元素
    this.bgImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    this.bgImage.setAttribute('x', String(rect.x));
    this.bgImage.setAttribute('y', String(rect.y));
    this.bgImage.setAttribute('width', String(rect.width));
    this.bgImage.setAttribute('height', String(rect.height));
    this.bgImage.setAttribute('href', element.backgroundUrl!);
    this.bgImage.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    this.bgImage.setAttribute('clip-path', `url(#${clipId})`);
    this.bgImage.setAttribute('opacity', '0.3');

    // 插入到 defs 之后
    if (this.bgDefs.nextSibling) {
      g.insertBefore(this.bgImage, this.bgDefs.nextSibling);
    } else {
      g.appendChild(this.bgImage);
    }

    this.currentBgUrl = element.backgroundUrl;
  }

  /**
   * 更新背景图位置和尺寸
   */
  private updateBackgroundImage(element: PlaitFrame, rect: RectangleClient): void {
    if (this.bgImage) {
      this.bgImage.setAttribute('x', String(rect.x));
      this.bgImage.setAttribute('y', String(rect.y));
      this.bgImage.setAttribute('width', String(rect.width));
      this.bgImage.setAttribute('height', String(rect.height));
      if (element.backgroundUrl) {
        this.bgImage.setAttribute('href', element.backgroundUrl);
      }
    }

    // 更新 clipPath 中的 rect
    if (this.bgClipPath) {
      const clipRect = this.bgClipPath.querySelector('rect');
      if (clipRect) {
        clipRect.setAttribute('x', String(rect.x));
        clipRect.setAttribute('y', String(rect.y));
        clipRect.setAttribute('width', String(rect.width));
        clipRect.setAttribute('height', String(rect.height));
      }
    }

    this.currentBgUrl = element.backgroundUrl;
  }

  /**
   * 移除背景图
   */
  private removeBackgroundImage(): void {
    this.bgDefs?.remove();
    this.bgImage?.remove();
    this.bgDefs = null;
    this.bgClipPath = null;
    this.bgImage = null;
    this.currentBgUrl = undefined;
  }

  private updateTitleBackground(frameX: number, frameY: number): void {
    if (!this.titleText || !this.titleBg) return;

    // 使用 getBBox 获取文本实际尺寸
    try {
      const bbox = this.titleText.getBBox();
      if (bbox.width > 0) {
        this.titleBg.setAttribute('x', String(frameX));
        this.titleBg.setAttribute('y', String(frameY + FRAME_TITLE_OFFSET_Y - bbox.height));
        this.titleBg.setAttribute('width', String(bbox.width + FRAME_TITLE_PADDING * 2));
        this.titleBg.setAttribute('height', String(bbox.height + 4));
        this.titleBg.setAttribute('rx', '4');
        this.titleBg.setAttribute('fill', 'rgba(255, 255, 255, 0.8)');
      }
    } catch {
      // getBBox 在元素未渲染时可能抛出异常
    }
  }

  destroy(): void {
    this.rectElement = null;
    this.titleText = null;
    this.titleBg = null;
    this.removeBackgroundImage();
  }
}
