/**
 * Frame 元素渲染生成器
 *
 * 在 SVG 画布上渲染 Frame 容器（虚线矩形 + 标题标签）
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

  updateDrawing(element: PlaitFrame, _g: SVGGElement): void {
    const rect = RectangleClient.getRectangleByPoints(element.points);

    if (this.rectElement) {
      this.rectElement.setAttribute('x', String(rect.x));
      this.rectElement.setAttribute('y', String(rect.y));
      this.rectElement.setAttribute('width', String(rect.width));
      this.rectElement.setAttribute('height', String(rect.height));
    }

    if (this.titleText) {
      this.titleText.setAttribute('x', String(rect.x + FRAME_TITLE_PADDING));
      this.titleText.setAttribute('y', String(rect.y + FRAME_TITLE_OFFSET_Y));
      this.titleText.textContent = element.name || 'Frame';
    }

    this.updateTitleBackground(rect.x, rect.y);
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
  }
}
