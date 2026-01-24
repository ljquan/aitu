/**
 * @tags manual
 * AI 生成功能 - 用户手册生成测试
 * 这些测试会生成用于用户手册的截图和步骤描述
 */
import { test, expect } from '../fixtures/test-base';
import {
  screenshotWithAnnotations,
  circleOnElement,
  highlightElement,
  arrowToElement,
  circle,
  arrow,
  highlight,
  Annotation,
} from '../utils/screenshot-annotations';

test.describe('AI 生成功能手册', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000); // 等待完全加载
  });

  test('使用 AI 生成图片', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'ai-generation',
        title: '使用 AI 生成图片',
        description: '学习如何使用 AI 功能生成图片',
        steps: [
          '在底部输入框中输入图片描述',
          '点击 # 选择生成模型',
          '点击发送按钮或按 Enter 键',
          '等待 AI 生成完成',
        ],
      }),
    });

    // 步骤 0: 展示 AI 输入框（带标注）
    const textarea = page.locator('[data-testid="ai-input-textarea"]');
    const modelSelector = page.getByRole('button', { name: /#/ }).first();
    
    const annotations0: Annotation[] = [];
    const inputHighlight = await highlightElement(textarea, '输入提示词');
    if (inputHighlight) annotations0.push(inputHighlight);
    
    const modelCircle = await circleOnElement(modelSelector, 1);
    if (modelCircle) annotations0.push(modelCircle);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/ai-step-0.png',
      annotations0
    );
    await testInfo.attach('ai-step-0', {
      path: 'test-results/manual-screenshots/ai-step-0.png',
      contentType: 'image/png',
    });

    // 步骤 1: 输入提示词（必须通过）
    await expect(textarea).toBeVisible();
    await textarea.click();
    await textarea.fill('一只可爱的猫咪在阳光下玩耍');
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/ai-step-1.png' });
    await testInfo.attach('ai-step-1', {
      path: 'test-results/manual-screenshots/ai-step-1.png',
      contentType: 'image/png',
    });

    // 步骤 2: 展示模型选择器（必须通过）
    await expect(modelSelector).toBeVisible();
    await modelSelector.click();
    await page.waitForTimeout(300);
    
    // 带标注的模型选择器截图
    const annotations2: Annotation[] = [
      arrow(300, 400, '选择生成模型', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/ai-step-2.png',
      annotations2
    );
    await testInfo.attach('ai-step-2', {
      path: 'test-results/manual-screenshots/ai-step-2.png',
      contentType: 'image/png',
    });

    // 关闭下拉菜单
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 步骤 3: 展示发送按钮
    const sendBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
    const annotations3: Annotation[] = [];
    const sendArrow = await arrowToElement(sendBtn, '点击发送', 'left');
    if (sendArrow) annotations3.push(sendArrow);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/ai-step-3.png',
      annotations3
    );
    await testInfo.attach('ai-step-3', {
      path: 'test-results/manual-screenshots/ai-step-3.png',
      contentType: 'image/png',
    });
  });

  test('使用灵感创意板', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'ai-generation',
        title: '使用灵感创意板',
        description: '当画布为空时，灵感创意板会显示推荐的创作模板',
        steps: [
          '在空画布上，灵感创意板自动显示',
          '浏览不同的创意模板',
          '点击感兴趣的模板',
          '模板的提示词会自动填充到输入框',
        ],
      }),
    });

    // 等待灵感板显示
    await page.waitForTimeout(1000);
    
    // 灵感创意板标题（必须通过）
    const inspirationTitle = page.getByRole('heading', { name: '灵感创意', level: 3 });
    await expect(inspirationTitle).toBeVisible();
    
    // 带标注的灵感板截图
    const firstCard = page.getByRole('heading', { name: '智能拆分宫格图', level: 3 });
    const annotations1: Annotation[] = [];
    const cardHighlight = await highlightElement(firstCard.locator('..').locator('..'), '点击使用模板');
    if (cardHighlight) annotations1.push(cardHighlight);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/inspiration-step-1.png',
      annotations1
    );
    await testInfo.attach('inspiration-step-1', {
      path: 'test-results/manual-screenshots/inspiration-step-1.png',
      contentType: 'image/png',
    });
    
    // 点击第一个灵感卡片（必须通过）
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await page.waitForTimeout(500);
    
    // 点击后显示提示词已填充
    const textarea = page.locator('[data-testid="ai-input-textarea"]');
    const annotations2: Annotation[] = [];
    const textareaHighlight = await highlightElement(textarea, '提示词已填充');
    if (textareaHighlight) annotations2.push(textareaHighlight);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/inspiration-step-2.png',
      annotations2
    );
    await testInfo.attach('inspiration-step-2', {
      path: 'test-results/manual-screenshots/inspiration-step-2.png',
      contentType: 'image/png',
    });
  });

  test('AI 视频生成入口', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'ai-generation',
        title: 'AI 视频生成',
        description: '使用 AI 生成视频',
      }),
    });

    // 点击 AI 视频生成按钮（使用 label 选择器精确定位）
    const toolbar = page.locator('.unified-toolbar').or(page.locator('[class*="toolbar"]')).first();
    const videoBtn = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /AI 视频生成/ }) }).first();
    
    const annotations1: Annotation[] = [];
    if (await videoBtn.isVisible().catch(() => false)) {
      const box = await videoBtn.boundingBox();
      if (box) {
        annotations1.push(highlight(box.x - 4, box.y - 4, box.width + 8, box.height + 8, 'AI 视频生成', undefined, 'right'));
      }
    }
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/video-entry.png',
      annotations1
    );
    await testInfo.attach('video-entry', {
      path: 'test-results/manual-screenshots/video-entry.png',
      contentType: 'image/png',
    });
    
    // 点击打开视频生成弹窗
    await videoBtn.click();
    await page.waitForTimeout(500);
    
    // 如果弹窗打开，截图
    const dialog = page.locator('[data-testid="video-generation-dialog"]').or(page.locator('.video-generation-dialog'));
    if (await dialog.isVisible()) {
      await page.screenshot({ path: 'test-results/manual-screenshots/video-dialog.png' });
      await testInfo.attach('video-dialog', {
        path: 'test-results/manual-screenshots/video-dialog.png',
        contentType: 'image/png',
      });
    }
  });
});
