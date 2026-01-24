/**
 * @tags smoke
 * 冒烟测试 - 基于实际页面元素和状态
 * 仅 2 次页面加载，覆盖所有核心功能
 */
import { test, expect } from '../fixtures/test-base';

test.describe('@smoke 核心功能验证', () => {
  /**
   * 测试1：主画布所有组件和交互
   */
  test('主画布：加载、工具栏、AI输入栏、视图导航', async ({ page }) => {
    await page.goto('/');
    
    // 1. 验证页面加载（必须通过）
    await expect(page).toHaveTitle(/AI图片视频创作/);
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // 2. 验证工具栏存在（必须通过）
    const handToolContainer = page.locator('div').filter({ has: page.getByRole('radio', { name: /手形工具/ }) }).first();
    const selectToolContainer = page.locator('div').filter({ has: page.getByRole('radio', { name: /选择/ }) }).first();
    await expect(handToolContainer).toBeVisible();
    await expect(selectToolContainer).toBeVisible();
    
    // 3. 工具栏按钮点击测试
    await handToolContainer.click({ force: true });
    await page.waitForTimeout(100);
    await selectToolContainer.click({ force: true });
    await page.waitForTimeout(100);
    
    // 画笔按钮（必须通过）
    const pencilBtn = page.getByRole('button', { name: /画笔/ });
    await expect(pencilBtn).toBeVisible();
    await pencilBtn.click();
    await page.waitForTimeout(100);
    
    // 形状按钮（必须通过）
    const shapeBtn = page.getByRole('button', { name: /形状/ });
    await expect(shapeBtn).toBeVisible();
    await shapeBtn.click();
    await page.waitForTimeout(100);
    
    // 4. AI 输入栏交互（必须通过）
    const aiInput = page.getByPlaceholder('描述你想要创建什么');
    await expect(aiInput).toBeVisible();
    await aiInput.fill('测试输入');
    await expect(aiInput).toHaveValue('测试输入');
    
    // 5. 模型选择器（必须通过）
    const modelSelector = page.getByRole('button', { name: /#/ }).first();
    await expect(modelSelector).toBeVisible();
    await modelSelector.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    
    // 6. 视图导航缩放（必须通过）
    const zoomIn = page.getByRole('button', { name: /放大/ });
    await expect(zoomIn).toBeVisible();
    // 缩放显示按钮名称是 "自适应"，显示内容如 "100%"
    const zoomDisplay = page.getByRole('button', { name: '自适应' });
    await expect(zoomDisplay).toBeVisible();
    const initialZoom = await zoomDisplay.textContent();
    await zoomIn.click();
    await page.waitForTimeout(200);
    const newZoom = await zoomDisplay.textContent();
    expect(newZoom).not.toBe(initialZoom);
  });

  /**
   * 测试2：所有弹窗/抽屉组件
   */
  test('弹窗抽屉：设置、项目、工具箱', async ({ page }) => {
    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1500);
    
    // === 项目抽屉 ===
    const openProjectBtn = page.getByRole('button', { name: '打开项目' });
    
    // 如果显示"打开项目"，点击打开；否则已经打开
    if (await openProjectBtn.isVisible().catch(() => false)) {
      await openProjectBtn.click();
      await page.waitForTimeout(500);
    }
    
    // 验证项目抽屉已打开（必须通过）
    const projectTitle = page.getByRole('heading', { name: '项目', level: 3, exact: true });
    await expect(projectTitle).toBeVisible();
    
    // === 工具箱 ===
    const openToolboxBtn = page.getByRole('button', { name: '打开工具箱' });
    if (await openToolboxBtn.isVisible().catch(() => false)) {
      await openToolboxBtn.click();
      await page.waitForTimeout(500);
    }
    
    // 验证工具箱已打开（必须通过）
    const toolboxTitle = page.getByRole('heading', { name: '工具箱', level: 3, exact: true });
    await expect(toolboxTitle).toBeVisible();
    
    // === 关闭抽屉测试 ===
    // 项目抽屉内部的关闭按钮（在标题行右侧）
    const closeProjectInnerBtn = page.locator('.side-drawer').filter({ hasText: '项目' }).getByRole('button', { name: '关闭' }).first();
    await expect(closeProjectInnerBtn).toBeVisible();
    await closeProjectInnerBtn.click();
    await page.waitForTimeout(300);
    // 验证已关闭（打开按钮应该出现）
    await expect(openProjectBtn).toBeVisible();
    
    // 工具箱内部的关闭按钮
    const closeToolboxInnerBtn = page.locator('.toolbox-drawer').getByRole('button', { name: '关闭' }).first();
    await expect(closeToolboxInnerBtn).toBeVisible();
    await closeToolboxInnerBtn.click();
    await page.waitForTimeout(300);
    // 验证已关闭
    await expect(openToolboxBtn).toBeVisible();
    
    // === 设置对话框（在"更多"菜单中）===
    const moreBtn = page.getByRole('button', { name: '更多' });
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();
    await page.waitForTimeout(300);
    // 关闭菜单
    await page.keyboard.press('Escape');
  });
});
