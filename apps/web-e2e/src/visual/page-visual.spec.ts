/**
 * @tags visual
 * 页面级视觉回归测试 - 覆盖主要页面场景
 */
import { test, expect } from '../fixtures/test-base';
import { DrawnixApp } from '../fixtures/test-app';
import { SnapshotHelper } from '../fixtures/snapshot-helper';

test.describe('@visual 页面级视觉回归', () => {
  let app: DrawnixApp;
  let snapshotHelper: SnapshotHelper;

  test.beforeEach(async ({ page }) => {
    app = new DrawnixApp(page);
    snapshotHelper = new SnapshotHelper(page, {
      maxDiffPixelRatio: 0.08,
      waitTime: 1000,
    });
  });

  /**
   * 测试1：应用初始加载状态
   */
  test('页面：初始加载', async ({ page }) => {
    await app.goto();
    await app.waitForStable(2000);
    
    // 隐藏可能的动态内容（如时间戳、随机ID等）
    await expect(page).toHaveScreenshot('page-initial-load.png', {
      maxDiffPixelRatio: 0.10,
      fullPage: true,
    });
  });

  /**
   * 测试2：空画布状态（含灵感板）
   */
  test('页面：空画布与灵感板', async ({ page }) => {
    await app.goto();
    await app.waitForStable(2000);
    
    // 空画布应该显示灵感创意板
    const hasInspirationBoard = await app.inspirationBoard.isVisible().catch(() => false);
    
    await expect(page).toHaveScreenshot('page-empty-canvas.png', {
      maxDiffPixelRatio: 0.10,
      fullPage: true,
    });
  });

  /**
   * 测试3：项目抽屉打开状态
   */
  test('页面：项目抽屉打开', async ({ page }) => {
    await app.goto();
    await app.waitForStable(1500);
    
    // 打开项目抽屉
    const projectBtn = page.getByRole('button', { name: /打开项目|项目/ });
    if (await projectBtn.isVisible()) {
      await projectBtn.click();
      await page.waitForTimeout(500);
    }
    
    await expect(page).toHaveScreenshot('page-project-drawer-open.png', {
      maxDiffPixelRatio: 0.10,
      fullPage: true,
    });
  });

  /**
   * 测试4：工具箱抽屉打开状态
   */
  test('页面：工具箱抽屉打开', async ({ page }) => {
    await app.goto();
    await app.waitForStable(1500);
    
    // 打开工具箱抽屉
    const toolboxBtn = page.getByRole('button', { name: /打开工具箱|工具箱/ });
    if (await toolboxBtn.isVisible()) {
      await toolboxBtn.click();
      await page.waitForTimeout(500);
    }
    
    await expect(page).toHaveScreenshot('page-toolbox-drawer-open.png', {
      maxDiffPixelRatio: 0.10,
      fullPage: true,
    });
  });

  /**
   * 测试5：聊天抽屉打开状态
   */
  test('页面：聊天抽屉打开', async ({ page }) => {
    await app.goto();
    await app.waitForStable(1500);
    
    // 打开聊天抽屉
    const chatTrigger = app.chatDrawer.trigger;
    if (await chatTrigger.isVisible()) {
      await chatTrigger.click();
      await page.waitForTimeout(500);
    }
    
    await expect(page).toHaveScreenshot('page-chat-drawer-open.png', {
      maxDiffPixelRatio: 0.10,
      fullPage: true,
    });
  });

  /**
   * 测试6：素材库弹窗打开状态
   */
  test('页面：素材库打开', async ({ page }) => {
    await app.goto();
    await app.waitForStable(1500);
    
    // 尝试打开素材库
    const mediaLibraryBtn = app.toolbar.mediaLibrary;
    if (await mediaLibraryBtn.isVisible()) {
      await mediaLibraryBtn.click();
      await page.waitForTimeout(800);
      
      await expect(page).toHaveScreenshot('page-media-library-open.png', {
        maxDiffPixelRatio: 0.10,
        fullPage: true,
      });
    }
  });

  /**
   * 测试7：设置对话框打开状态
   */
  test('页面：设置对话框打开', async ({ page }) => {
    await app.goto();
    await app.waitForStable(1500);
    
    // 打开设置
    const settingsBtn = app.toolbar.settings;
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      
      await expect(page).toHaveScreenshot('page-settings-open.png', {
        maxDiffPixelRatio: 0.10,
        fullPage: true,
      });
    }
  });

  /**
   * 测试8：多面板并存状态
   */
  test('页面：多面板并存', async ({ page }) => {
    await app.goto();
    await app.waitForStable(1500);
    
    // 打开项目抽屉
    const projectBtn = page.getByRole('button', { name: /打开项目|项目/ });
    if (await projectBtn.isVisible()) {
      await projectBtn.click();
      await page.waitForTimeout(300);
    }
    
    // 打开聊天抽屉
    const chatTrigger = app.chatDrawer.trigger;
    if (await chatTrigger.isVisible()) {
      await chatTrigger.click();
      await page.waitForTimeout(300);
    }
    
    await expect(page).toHaveScreenshot('page-multi-panel.png', {
      maxDiffPixelRatio: 0.10,
      fullPage: true,
    });
  });
});
