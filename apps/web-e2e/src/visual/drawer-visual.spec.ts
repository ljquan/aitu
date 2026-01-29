/**
 * @tags visual
 * 抽屉组件视觉回归测试
 */
import { test, expect } from '../fixtures/test-base';
import { DrawnixApp } from '../fixtures/test-app';
import { SnapshotHelper } from '../fixtures/snapshot-helper';

test.describe('@visual 抽屉组件视觉回归', () => {
  let app: DrawnixApp;
  let snapshotHelper: SnapshotHelper;

  test.beforeEach(async ({ page }) => {
    app = new DrawnixApp(page);
    snapshotHelper = new SnapshotHelper(page, {
      maxDiffPixelRatio: 0.10,
      waitTime: 500,
    });
    await app.goto();
    await app.waitForStable(1500);
  });

  test.describe('项目抽屉', () => {
    test('项目抽屉 - 默认状态', async ({ page }) => {
      const projectBtn = page.getByRole('button', { name: /打开项目|项目/ });
      if (await projectBtn.isVisible()) {
        await projectBtn.click();
        await page.waitForTimeout(500);
      }
      
      const projectDrawer = page.locator('.project-drawer');
      await expect(projectDrawer).toBeVisible();
      await expect(projectDrawer).toHaveScreenshot('project-drawer-default.png', {
        maxDiffPixelRatio: 0.10,
      });
    });

    test('项目抽屉 - 搜索状态', async ({ page }) => {
      const projectBtn = page.getByRole('button', { name: /打开项目|项目/ });
      if (await projectBtn.isVisible()) {
        await projectBtn.click();
        await page.waitForTimeout(500);
      }
      
      // 输入搜索内容
      const searchInput = page.locator('.project-drawer input[type="text"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill('测试');
        await page.waitForTimeout(300);
      }
      
      const projectDrawer = page.locator('.project-drawer');
      await expect(projectDrawer).toHaveScreenshot('project-drawer-search.png', {
        maxDiffPixelRatio: 0.10,
      });
    });
  });

  test.describe('工具箱抽屉', () => {
    test('工具箱抽屉 - 全部工具', async ({ page }) => {
      const toolboxBtn = page.getByRole('button', { name: /打开工具箱|工具箱/ });
      if (await toolboxBtn.isVisible()) {
        await toolboxBtn.click();
        await page.waitForTimeout(500);
      }
      
      const toolboxDrawer = page.locator('.toolbox-drawer');
      await expect(toolboxDrawer).toBeVisible();
      await expect(toolboxDrawer).toHaveScreenshot('toolbox-drawer-all.png', {
        maxDiffPixelRatio: 0.10,
      });
    });

    test('工具箱抽屉 - 内容工具分类', async ({ page }) => {
      const toolboxBtn = page.getByRole('button', { name: /打开工具箱|工具箱/ });
      if (await toolboxBtn.isVisible()) {
        await toolboxBtn.click();
        await page.waitForTimeout(500);
      }
      
      // 点击内容工具分类按钮（使用更精确的选择器避免匹配标题）
      const contentTab = page.locator('.toolbox-drawer').getByRole('button', { name: '内容工具' });
      if (await contentTab.isVisible()) {
        await contentTab.click();
        await page.waitForTimeout(300);
      }
      
      const toolboxDrawer = page.locator('.toolbox-drawer');
      await expect(toolboxDrawer).toHaveScreenshot('toolbox-drawer-content.png', {
        maxDiffPixelRatio: 0.10,
      });
    });

    test('工具箱抽屉 - AI工具分类', async ({ page }) => {
      const toolboxBtn = page.getByRole('button', { name: /打开工具箱|工具箱/ });
      if (await toolboxBtn.isVisible()) {
        await toolboxBtn.click();
        await page.waitForTimeout(500);
      }
      
      // 点击 AI 工具分类
      const aiTab = page.locator('.toolbox-drawer').getByText('AI工具');
      if (await aiTab.isVisible()) {
        await aiTab.click();
        await page.waitForTimeout(300);
      }
      
      const toolboxDrawer = page.locator('.toolbox-drawer');
      await expect(toolboxDrawer).toHaveScreenshot('toolbox-drawer-ai.png', {
        maxDiffPixelRatio: 0.10,
      });
    });
  });

  test.describe('聊天抽屉', () => {
    test('聊天抽屉 - 空会话', async ({ page }) => {
      const chatTrigger = app.chatDrawer.trigger;
      if (await chatTrigger.isVisible()) {
        await chatTrigger.click();
        await page.waitForTimeout(500);
      }
      
      const chatDrawer = app.chatDrawer.container;
      await expect(chatDrawer).toBeVisible();
      await expect(chatDrawer).toHaveScreenshot('chat-drawer-empty.png', {
        maxDiffPixelRatio: 0.10,
      });
    });

    test('聊天抽屉 - 会话列表展开', async ({ page }) => {
      const chatTrigger = app.chatDrawer.trigger;
      if (await chatTrigger.isVisible()) {
        await chatTrigger.click();
        await page.waitForTimeout(500);
      }
      
      // 点击会话列表按钮
      const sessionListBtn = page.locator('.chat-drawer__close-btn').filter({ has: page.locator('svg') });
      const buttons = await sessionListBtn.all();
      for (const btn of buttons) {
        const ariaLabel = await btn.getAttribute('aria-label');
        if (ariaLabel?.includes('会话')) {
          await btn.click();
          await page.waitForTimeout(300);
          break;
        }
      }
      
      const chatDrawer = app.chatDrawer.container;
      await expect(chatDrawer).toHaveScreenshot('chat-drawer-session-list.png', {
        maxDiffPixelRatio: 0.10,
      });
    });
  });

  test.describe('任务队列面板', () => {
    test('任务队列面板 - 空状态', async ({ page }) => {
      // 尝试打开任务队列
      const taskQueueBtn = page.locator('[data-testid="toolbar-task-queue"], .unified-toolbar button').filter({ hasText: /任务|队列/ });
      if (await taskQueueBtn.first().isVisible()) {
        await taskQueueBtn.first().click();
        await page.waitForTimeout(500);
      }
      
      const taskPanel = app.taskQueue.panel;
      if (await taskPanel.isVisible()) {
        await expect(taskPanel).toHaveScreenshot('task-queue-empty.png', {
          maxDiffPixelRatio: 0.10,
        });
      }
    });
  });
});
