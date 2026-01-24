/**
 * GIF 录制测试
 * 
 * 用于生成用户手册中的 GIF 动图演示
 * 
 * 使用方法：
 * 1. 运行 `pnpm manual:record` 录制操作
 * 2. 将录制的代码复制到下面对应的测试中
 * 3. 运行 `pnpm manual:gif` 生成 GIF
 */

import { test, expect, Page } from '@playwright/test';

/**
 * 显示快捷键提示
 * 在屏幕右下角显示按键提示，用于 GIF 演示
 */
async function showKeyHint(page: Page, key: string, duration: number = 1500) {
  await page.evaluate(({ keyText, dur }) => {
    // 创建或获取提示容器
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
    
    // 创建提示元素
    const hint = document.createElement('div');
    hint.style.cssText = `
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
    
    // 添加提示内容
    hint.innerHTML = `<span>${keyText}</span>`;
    
    // 添加动画样式
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
    
    container.appendChild(hint);
    
    // 定时移除（使用传入的 duration）
    setTimeout(() => {
      hint.style.animation = 'keyHintOut 0.3s ease-in forwards';
      setTimeout(() => hint.remove(), 300);
    }, dur - 300);
  }, { keyText: key, dur: duration });
  
  await page.waitForTimeout(duration);
}

/**
 * 带提示的按键操作
 */
async function pressWithHint(page: Page, key: string, displayKey?: string) {
  const display = displayKey || key.toUpperCase();
  await showKeyHint(page, display);
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

/**
 * 显示点击效果
 * 在元素上显示红色圆圈动画，标识点击位置
 */
async function showClickEffect(page: Page, x: number, y: number, label?: string) {
  await page.evaluate(({ posX, posY, text }) => {
    // 创建点击效果容器
    const effect = document.createElement('div');
    effect.style.cssText = `
      position: fixed;
      left: ${posX}px;
      top: ${posY}px;
      transform: translate(-50%, -50%);
      z-index: 999999;
      pointer-events: none;
    `;
    
    // 红色圆圈
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
    
    // 标签文字
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
    
    // 添加动画样式
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
    
    // 移除效果
    setTimeout(() => effect.remove(), 1500);
  }, { posX: x, posY: y, text: label });
}

// 是否已记录第一次点击
let firstClickLogged = false;

/**
 * 点击元素并显示点击效果
 */
async function clickWithEffect(page: Page, locator: ReturnType<Page['locator']>, label?: string, waitAfter: number = 1500) {
  // 记录第一次点击的时间（用于计算裁剪点）
  if (!firstClickLogged && testStartTime) {
    const elapsed = (Date.now() - testStartTime) / 1000;
    // 输出裁剪建议（第一次点击前 1 秒开始）
    const trimStart = Math.max(0, elapsed - 1).toFixed(1);
    console.log(`\n📍 第一次点击时间: ${elapsed.toFixed(1)}s`);
    console.log(`✂️  建议裁剪参数: --trim ${trimStart}\n`);
    firstClickLogged = true;
  }
  
  const box = await locator.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    
    // 先显示点击效果
    await showClickEffect(page, x, y, label);
    await page.waitForTimeout(500);
    
    // 再执行点击
    await locator.click();
    await page.waitForTimeout(waitAfter);
  } else {
    await locator.click();
    await page.waitForTimeout(waitAfter);
  }
}

/**
 * 重置第一次点击记录（用于多个测试）
 */
function resetFirstClick() {
  firstClickLogged = false;
}

// 记录测试开始时间，用于计算裁剪点
let testStartTime: number;

test.describe('GIF 动图录制', () => {
  test.beforeEach(async ({ page }) => {
    // 视频从这里开始录制，记录时间
    testStartTime = Date.now();
    firstClickLogged = false;
    
    await page.goto('/');
    // 等待应用加载
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    // 等待 UI 完全稳定
    await page.waitForTimeout(2000);
  });

  test('思维导图创建演示', async ({ page }) => {
    // 使用 Markdown 到 Drawnix 创建思维导图
    // 注意：beforeEach 已等待 2 秒，转 GIF 时用 --trim 2 裁剪
    
    // 点击工具箱更多按钮
    await clickWithEffect(
      page, 
      page.getByTestId('toolbar-more'), 
      '点击更多工具',
      1500
    );
    
    // 点击 Markdown 到 Drawnix
    await clickWithEffect(
      page, 
      page.getByRole('button', { name: 'Markdown 到 Drawnix' }), 
      '选择 Markdown 转换',
      1500
    );
    
    // 点击插入（使用默认示例）
    await clickWithEffect(
      page, 
      page.getByRole('button', { name: '插入' }), 
      '点击插入',
      2500
    );
    
    // 关闭对话框
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    
    // 演示编辑思维导图
    // 点击思维导图中的一个节点
    const mindNode = page.locator('.mind-node-content').first();
    if (await mindNode.isVisible().catch(() => false)) {
      await clickWithEffect(page, mindNode, '点击节点进入编辑', 1500);
      
      // Tab 添加子节点
      await showKeyHint(page, 'Tab：添加子节点', 2000);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(1500);
      
      await page.keyboard.type('新子节点', { delay: 200 });
      await page.waitForTimeout(1500);
      
      // Enter 添加同级节点
      await showKeyHint(page, 'Enter：添加同级节点', 2000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      
      await page.keyboard.type('同级节点', { delay: 200 });
      await page.waitForTimeout(2000);
    }
    
    // 点击空白处完成编辑
    await page.mouse.click(100, 100);
    await page.waitForTimeout(2500);
  });

  test('画笔绘制演示', async ({ page }) => {
    // 按 P 切换到画笔
    await showKeyHint(page, 'P - 画笔工具');
    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    
    const canvas = page.locator('.board-host-svg');
    const box = await canvas.boundingBox();
    
    if (box) {
      const startX = box.x + 200;
      const startY = box.y + 200;
      
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      
      // 绘制波浪线
      for (let i = 0; i < 10; i++) {
        const x = startX + i * 30;
        const y = startY + Math.sin(i * 0.5) * 50;
        await page.mouse.move(x, y);
        await page.waitForTimeout(50);
      }
      
      await page.mouse.up();
    }
    
    await page.waitForTimeout(1000);
  });

  test('AI 图片生成演示', async ({ page }) => {
    const inputBar = page.locator('[data-testid="ai-input-textarea"]');
    
    if (await inputBar.isVisible().catch(() => false)) {
      await inputBar.click();
      await page.waitForTimeout(300);
      
      await page.keyboard.type('一只可爱的橘猫', { delay: 100 });
      await page.waitForTimeout(1000);
    }
    
    await page.waitForTimeout(1000);
  });
});
