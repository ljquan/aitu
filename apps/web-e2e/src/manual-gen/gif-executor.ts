/**
 * GIF DSL 执行器
 * 
 * 执行 GIF 定义中的动作序列，并记录时间节点
 */

import { Page } from '@playwright/test';
import {
  GifDefinition,
  GifAction,
  GifTimeSegment,
  GifManifest,
  ExecutorConfig,
  DEFAULT_EXECUTOR_CONFIG,
} from './gif-types';

export class GifExecutor {
  private config: Required<ExecutorConfig>;
  private startTime: number = 0;
  private segments: GifTimeSegment[] = [];

  constructor(config: ExecutorConfig = {}) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
  }

  /**
   * 获取从录制开始经过的时间（秒）
   */
  private elapsed(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * 执行所有 GIF 定义
   */
  async executeAll(page: Page, definitions: GifDefinition[]): Promise<GifTimeSegment[]> {
    this.startTime = Date.now();
    this.segments = [];

    for (const def of definitions) {
      await this.executeDefinition(page, def);
    }

    return this.segments;
  }

  /**
   * 执行单个 GIF 定义
   */
  async executeDefinition(page: Page, def: GifDefinition): Promise<GifTimeSegment> {
    // 片段开始前等待
    const preWait = def.preWait ?? 1000;
    await page.waitForTimeout(preWait);

    const startTime = this.elapsed();
    console.log(`\n🎬 开始录制: ${def.name} (${startTime.toFixed(1)}s)`);

    // 执行所有动作
    for (const action of def.actions) {
      await this.executeAction(page, action);
    }

    // 片段结束后等待
    const postWait = def.postWait ?? 1500;
    await page.waitForTimeout(postWait);

    const endTime = this.elapsed();
    console.log(`✅ 完成录制: ${def.name} (${endTime.toFixed(1)}s)`);

    const segment: GifTimeSegment = {
      id: def.id,
      output: def.output,
      startTime,
      endTime,
    };

    this.segments.push(segment);

    // 片段间隔
    await page.waitForTimeout(this.config.segmentGap);

    return segment;
  }

  /**
   * 执行单个动作
   */
  private async executeAction(page: Page, action: GifAction): Promise<void> {
    switch (action.type) {
      case 'click':
        await this.executeClick(page, action);
        break;
      case 'press':
        await this.executePress(page, action);
        break;
      case 'type':
        await this.executeType(page, action);
        break;
      case 'keyHint':
        await this.executeKeyHint(page, action);
        break;
      case 'mouseClick':
        await this.executeMouseClick(page, action);
        break;
      case 'mouseDraw':
        await this.executeMouseDraw(page, action);
        break;
      case 'wait':
        await page.waitForTimeout(action.duration);
        break;
      case 'scroll':
        await this.executeScroll(page, action);
        break;
      case 'hover':
        await this.executeHover(page, action);
        break;
    }
  }

  /**
   * 解析目标选择器
   * 支持的格式：
   * - 普通选择器: ".class", "#id", "[data-testid='xxx']"
   * - role 选择器: "role:button[name='文字']"
   * - text 选择器: "text:文字"
   * - testid 选择器: "testid:xxx"
   * - first 选择器: "first:.class" (选择第一个匹配元素)
   */
  private getLocator(page: Page, target: string) {
    if (target.startsWith('role:')) {
      // role:button[name='xxx'] 格式
      const match = target.match(/^role:(\w+)\[name='([^']+)'\]$/);
      if (match) {
        return page.getByRole(match[1] as any, { name: match[2] });
      }
      // role:button 格式（无 name）
      const simpleMatch = target.match(/^role:(\w+)$/);
      if (simpleMatch) {
        return page.getByRole(simpleMatch[1] as any);
      }
    }
    
    if (target.startsWith('text:')) {
      return page.getByText(target.slice(5));
    }
    
    if (target.startsWith('testid:')) {
      return page.getByTestId(target.slice(7));
    }
    
    if (target.startsWith('first:')) {
      return page.locator(target.slice(6)).first();
    }
    
    // 普通 CSS/Playwright 选择器
    return page.locator(target);
  }

  /**
   * 执行点击动作
   */
  private async executeClick(
    page: Page,
    action: { target: string; label?: string; wait?: number; optional?: boolean; timeout?: number }
  ): Promise<void> {
    const locator = this.getLocator(page, action.target);
    const timeout = action.timeout ?? 10000;
    
    // 对于可选元素，先检查是否存在
    if (action.optional) {
      try {
        const isVisible = await locator.isVisible().catch(() => false);
        if (!isVisible) {
          // 等待一段时间看元素是否出现
          await page.waitForTimeout(2000);
          const stillNotVisible = !(await locator.isVisible().catch(() => false));
          if (stillNotVisible) {
            console.log(`   ⏭️ 跳过可选动作: ${action.label || action.target}`);
            return;
          }
        }
      } catch {
        console.log(`   ⏭️ 跳过可选动作: ${action.label || action.target}`);
        return;
      }
    }
    
    if (this.config.showClickEffect) {
      try {
        const box = await locator.boundingBox({ timeout });
        if (box) {
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          await this.showClickEffect(page, x, y, action.label);
          await page.waitForTimeout(500);
        }
      } catch (error) {
        // 如果获取 boundingBox 失败，仍然尝试点击
        console.log(`   ⚠️ 无法获取元素位置，直接点击: ${action.label || action.target}`);
      }
    }

    await locator.click({ timeout });
    await page.waitForTimeout(action.wait ?? this.config.defaultClickWait);
  }

  /**
   * 执行按键动作
   */
  private async executePress(
    page: Page,
    action: { key: string; wait?: number }
  ): Promise<void> {
    await page.keyboard.press(action.key);
    await page.waitForTimeout(action.wait ?? this.config.defaultPressWait);
  }

  /**
   * 执行输入动作
   */
  private async executeType(
    page: Page,
    action: { text: string; delay?: number; wait?: number }
  ): Promise<void> {
    await page.keyboard.type(action.text, {
      delay: action.delay ?? this.config.defaultTypeDelay,
    });
    await page.waitForTimeout(action.wait ?? 500);
  }

  /**
   * 执行快捷键提示动作
   */
  private async executeKeyHint(
    page: Page,
    action: { key: string; hint: string; duration?: number }
  ): Promise<void> {
    if (!this.config.showKeyHint) return;

    const duration = action.duration ?? 1500;
    await this.showKeyHint(page, action.hint, duration);
  }

  /**
   * 执行坐标点击动作
   */
  private async executeMouseClick(
    page: Page,
    action: { x: number; y: number; label?: string; wait?: number }
  ): Promise<void> {
    if (this.config.showClickEffect) {
      await this.showClickEffect(page, action.x, action.y, action.label);
      await page.waitForTimeout(500);
    }

    await page.mouse.click(action.x, action.y);
    await page.waitForTimeout(action.wait ?? 500);
  }

  /**
   * 执行鼠标绘制动作
   */
  private async executeMouseDraw(
    page: Page,
    action: { points: Array<{ x: number; y: number }>; stepDelay?: number; wait?: number }
  ): Promise<void> {
    if (action.points.length === 0) return;

    const stepDelay = action.stepDelay ?? 50;
    const [first, ...rest] = action.points;

    await page.mouse.move(first.x, first.y);
    await page.mouse.down();

    for (const point of rest) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(stepDelay);
    }

    await page.mouse.up();
    await page.waitForTimeout(action.wait ?? 500);
  }

  /**
   * 执行滚动动作
   */
  private async executeScroll(
    page: Page,
    action: { target?: string; deltaY: number; wait?: number }
  ): Promise<void> {
    if (action.target) {
      const locator = this.getLocator(page, action.target);
      await locator.evaluate((el, dy) => {
        el.scrollBy(0, dy);
      }, action.deltaY);
    } else {
      await page.mouse.wheel(0, action.deltaY);
    }
    await page.waitForTimeout(action.wait ?? 500);
  }

  /**
   * 执行悬停动作
   */
  private async executeHover(
    page: Page,
    action: { target: string; label?: string; wait?: number }
  ): Promise<void> {
    const locator = this.getLocator(page, action.target);
    await locator.hover();

    if (this.config.showClickEffect && action.label) {
      const box = await locator.boundingBox();
      if (box) {
        await this.showHoverLabel(page, box.x + box.width / 2, box.y - 30, action.label);
      }
    }

    await page.waitForTimeout(action.wait ?? 1000);
  }

  /**
   * 显示点击效果
   */
  private async showClickEffect(page: Page, x: number, y: number, label?: string): Promise<void> {
    await page.evaluate(({ posX, posY, text }) => {
      const effect = document.createElement('div');
      effect.style.cssText = `
        position: fixed;
        left: ${posX}px;
        top: ${posY}px;
        transform: translate(-50%, -50%);
        z-index: 999999;
        pointer-events: none;
      `;

      const circle = document.createElement('div');
      circle.style.cssText = `
        width: 40px;
        height: 40px;
        border: 4px solid #E91E63;
        border-radius: 50%;
        background: rgba(233, 30, 99, 0.2);
        animation: clickPulse 0.8s ease-out;
      `;
      effect.appendChild(circle);

      if (text) {
        const labelEl = document.createElement('div');
        labelEl.style.cssText = `
          position: absolute;
          top: 50px;
          left: 50%;
          transform: translateX(-50%);
          background: #E91E63;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        labelEl.textContent = text;
        effect.appendChild(labelEl);
      }

      if (!document.getElementById('click-effect-styles')) {
        const style = document.createElement('style');
        style.id = 'click-effect-styles';
        style.textContent = `
          @keyframes clickPulse {
            0% { transform: scale(0.5); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
            100% { transform: scale(1); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(effect);
      setTimeout(() => effect.remove(), 1500);
    }, { posX: x, posY: y, text: label });
  }

  /**
   * 显示快捷键提示
   */
  private async showKeyHint(page: Page, hint: string, duration: number): Promise<void> {
    await page.evaluate(({ hintText, dur }) => {
      let container = document.getElementById('key-hint-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'key-hint-container';
        container.style.cssText = `
          position: fixed;
          bottom: 120px;
          right: 50px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          pointer-events: none;
        `;
        document.body.appendChild(container);
      }

      const hintEl = document.createElement('div');
      hintEl.style.cssText = `
        background: linear-gradient(135deg, #F39C12 0%, #E67E22 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 10px;
        font-size: 20px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        animation: keyHintIn 0.3s ease-out;
      `;
      hintEl.innerHTML = `<span>${hintText}</span>`;

      if (!document.getElementById('key-hint-styles')) {
        const style = document.createElement('style');
        style.id = 'key-hint-styles';
        style.textContent = `
          @keyframes keyHintIn {
            from { opacity: 0; transform: translateX(20px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes keyHintOut {
            from { opacity: 1; transform: translateX(0); }
            to { opacity: 0; transform: translateX(20px); }
          }
        `;
        document.head.appendChild(style);
      }

      container.appendChild(hintEl);

      setTimeout(() => {
        hintEl.style.animation = 'keyHintOut 0.3s ease-in forwards';
        setTimeout(() => hintEl.remove(), 300);
      }, dur - 300);
    }, { hintText: hint, dur: duration });

    await page.waitForTimeout(duration);
  }

  /**
   * 显示悬停标签
   */
  private async showHoverLabel(page: Page, x: number, y: number, label: string): Promise<void> {
    await page.evaluate(({ posX, posY, text }) => {
      const labelEl = document.createElement('div');
      labelEl.style.cssText = `
        position: fixed;
        left: ${posX}px;
        top: ${posY}px;
        transform: translateX(-50%);
        background: #5A4FCF;
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        pointer-events: none;
        animation: fadeIn 0.2s ease-out;
      `;
      labelEl.textContent = text;

      if (!document.getElementById('hover-label-styles')) {
        const style = document.createElement('style');
        style.id = 'hover-label-styles';
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(labelEl);
      setTimeout(() => labelEl.remove(), 2000);
    }, { posX: x, posY: y, text: label });
  }
}
