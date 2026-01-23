/**
 * @tags manual
 * AI 生成功能 - 用户手册生成测试
 * 这些测试会生成用于用户手册的截图和步骤描述
 */
import { test, expect } from '../fixtures/test-base';

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

    // 步骤 1: 展示 AI 输入框
    await page.screenshot({ path: 'test-results/manual-screenshots/ai-step-0.png' });
    await testInfo.attach('初始状态', {
      path: 'test-results/manual-screenshots/ai-step-0.png',
      contentType: 'image/png',
    });

    // 步骤 2: 输入提示词（必须通过）
    const textarea = page.getByPlaceholder('描述你想要创建什么');
    await expect(textarea).toBeVisible();
    await textarea.click();
    await textarea.fill('一只可爱的猫咪在阳光下玩耍');
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/ai-step-1.png' });
    await testInfo.attach('步骤 1: 输入提示词', {
      path: 'test-results/manual-screenshots/ai-step-1.png',
      contentType: 'image/png',
    });

    // 步骤 3: 展示模型选择器（必须通过）
    const modelSelector = page.getByRole('button', { name: /#/ }).first();
    await expect(modelSelector).toBeVisible();
    await modelSelector.click();
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/ai-step-2.png' });
    await testInfo.attach('步骤 2: 选择模型', {
      path: 'test-results/manual-screenshots/ai-step-2.png',
      contentType: 'image/png',
    });

    // 关闭下拉菜单
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 步骤 4: 展示发送状态
    await page.screenshot({ path: 'test-results/manual-screenshots/ai-step-3.png' });
    await testInfo.attach('步骤 3: 准备发送', {
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
    
    await page.screenshot({ path: 'test-results/manual-screenshots/inspiration-step-1.png' });
    await testInfo.attach('步骤 1: 灵感创意板', {
      path: 'test-results/manual-screenshots/inspiration-step-1.png',
      contentType: 'image/png',
    });
    
    // 点击第一个灵感卡片（必须通过）
    const firstCard = page.getByRole('heading', { name: '智能拆分宫格图', level: 3 });
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/inspiration-step-2.png' });
    await testInfo.attach('步骤 2: 选择模板后', {
      path: 'test-results/manual-screenshots/inspiration-step-2.png',
      contentType: 'image/png',
    });
  });
});
