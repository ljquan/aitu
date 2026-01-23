/**
 * @tags manual
 * 绘图功能 - 用户手册生成测试
 * 这些测试会生成用于用户手册的截图和步骤描述
 */
import { test, expect } from '../fixtures/test-base';

test.describe('绘图功能手册', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000); // 等待完全加载
  });

  test('使用画笔工具绘制', async ({ page }, testInfo) => {
    // 文档元数据
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'drawing',
        title: '使用画笔工具',
        description: '学习如何使用画笔工具在画布上自由绘制',
        steps: [
          '点击左侧工具栏的画笔图标',
          '在画布上按住鼠标左键并拖动',
          '松开鼠标完成绘制',
        ],
      }),
    });

    // 步骤 1: 点击画笔工具（使用 button role）
    await page.screenshot({ path: 'test-results/manual-screenshots/drawing-step-0.png' });
    await testInfo.attach('初始状态', {
      path: 'test-results/manual-screenshots/drawing-step-0.png',
      contentType: 'image/png',
    });

    const pencilTool = page.getByRole('button', { name: /画笔/ });
    await expect(pencilTool).toBeVisible();
    await pencilTool.click();
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/drawing-step-1.png' });
    await testInfo.attach('步骤 1: 选择画笔工具', {
      path: 'test-results/manual-screenshots/drawing-step-1.png',
      contentType: 'image/png',
    });

    // 步骤 2: 在画布上绘制
    const canvas = page.locator('.board-host-svg');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    
    if (box) {
      const startX = box.x + 150;
      const startY = box.y + 150;
      
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 100, startY + 50);
      await page.mouse.move(startX + 150, startY + 100);
      await page.mouse.up();
    }
    
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/manual-screenshots/drawing-step-2.png' });
    await testInfo.attach('步骤 2: 绘制线条', {
      path: 'test-results/manual-screenshots/drawing-step-2.png',
      contentType: 'image/png',
    });
  });

  test('创建形状', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'drawing',
        title: '创建形状',
        description: '学习如何在画布上创建各种形状',
        steps: [
          '点击左侧工具栏的形状图标',
          '在画布上点击要放置形状的位置',
          '形状将自动创建，可以拖动调整大小',
        ],
      }),
    });

    // 步骤 1: 点击形状工具
    const shapeTool = page.getByRole('button', { name: /形状/ });
    await expect(shapeTool).toBeVisible();
    await shapeTool.click();
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/shape-step-1.png' });
    await testInfo.attach('步骤 1: 选择形状工具', {
      path: 'test-results/manual-screenshots/shape-step-1.png',
      contentType: 'image/png',
    });

    // 步骤 2: 在画布上创建形状
    const canvas = page.locator('.board-host-svg');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    
    if (box) {
      await page.mouse.click(box.x + 250, box.y + 250);
    }
    
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/manual-screenshots/shape-step-2.png' });
    await testInfo.attach('步骤 2: 创建形状', {
      path: 'test-results/manual-screenshots/shape-step-2.png',
      contentType: 'image/png',
    });
  });

  test('添加文本', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'drawing',
        title: '添加文本',
        description: '学习如何在画布上添加文本',
        steps: [
          '点击左侧工具栏的文本图标',
          '在画布上点击要添加文本的位置',
          '输入您想要的文字内容',
          '点击画布空白处完成编辑',
        ],
      }),
    });

    // 步骤 1: 点击文本工具（文本工具是 radio，需要点击父容器）
    const textToolContainer = page.locator('div').filter({ has: page.getByRole('radio', { name: /文本/ }) }).first();
    await expect(textToolContainer).toBeVisible();
    await textToolContainer.click({ force: true });
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/text-step-1.png' });
    await testInfo.attach('步骤 1: 选择文本工具', {
      path: 'test-results/manual-screenshots/text-step-1.png',
      contentType: 'image/png',
    });

    // 步骤 2: 在画布上点击
    const canvas = page.locator('.board-host-svg');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    
    if (box) {
      await page.mouse.click(box.x + 300, box.y + 300);
      await page.waitForTimeout(300);
      
      // 步骤 3: 输入文字
      await page.keyboard.type('Hello Aitu!');
    }
    
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/manual-screenshots/text-step-2.png' });
    await testInfo.attach('步骤 2: 输入文本', {
      path: 'test-results/manual-screenshots/text-step-2.png',
      contentType: 'image/png',
    });
  });
});
