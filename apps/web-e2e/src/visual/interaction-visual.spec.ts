/**
 * @tags visual
 * 交互状态视觉回归测试
 */
import { test, expect } from '../fixtures/test-base';
import { DrawnixApp } from '../fixtures/test-app';
import { SnapshotHelper } from '../fixtures/snapshot-helper';

test.describe('@visual 交互状态视觉回归', () => {
  let app: DrawnixApp;
  let snapshotHelper: SnapshotHelper;

  test.beforeEach(async ({ page }) => {
    app = new DrawnixApp(page);
    snapshotHelper = new SnapshotHelper(page, {
      maxDiffPixelRatio: 0.10,
      waitTime: 300,
    });
    await app.goto();
    await app.waitForStable(1500);
  });

  test.describe('抽屉切换交互', () => {
    test('项目抽屉 - 打开/关闭', async ({ page }) => {
      // 关闭状态
      await expect(page).toHaveScreenshot('drawer-project-closed.png', {
        maxDiffPixelRatio: 0.10,
        fullPage: true,
      });
      
      // 打开
      const projectBtn = page.getByRole('button', { name: /打开项目|项目/ });
      if (await projectBtn.isVisible()) {
        await projectBtn.click();
        await page.waitForTimeout(500);
      }
      
      // 打开状态
      await expect(page).toHaveScreenshot('drawer-project-open.png', {
        maxDiffPixelRatio: 0.10,
        fullPage: true,
      });
    });

    test('聊天抽屉 - 打开/关闭', async ({ page }) => {
      // 关闭状态
      await expect(page).toHaveScreenshot('drawer-chat-closed.png', {
        maxDiffPixelRatio: 0.10,
        fullPage: true,
      });
      
      // 打开
      const chatTrigger = app.chatDrawer.trigger;
      if (await chatTrigger.isVisible()) {
        await chatTrigger.click();
        await page.waitForTimeout(500);
      }
      
      // 打开状态
      await expect(page).toHaveScreenshot('drawer-chat-open.png', {
        maxDiffPixelRatio: 0.10,
        fullPage: true,
      });
    });
  });

  test.describe('工具选择交互', () => {
    test('工具栏 - 选择画笔工具', async ({ page }) => {
      const toolbar = page.locator('.unified-toolbar');
      
      // 默认状态
      await expect(toolbar).toHaveScreenshot('toolbar-default-state.png', {
        maxDiffPixelRatio: 0.10,
      });
      
      // 选择画笔工具
      const pencilBtn = app.toolbar.pencil;
      if (await pencilBtn.isVisible()) {
        await pencilBtn.click();
        await page.waitForTimeout(200);
      }
      
      // 选中状态
      await expect(toolbar).toHaveScreenshot('toolbar-pencil-selected.png', {
        maxDiffPixelRatio: 0.10,
      });
    });

    test('工具栏 - 选择形状工具', async ({ page }) => {
      const toolbar = page.locator('.unified-toolbar');
      
      // 选择形状工具
      const shapeBtn = app.toolbar.shape;
      if (await shapeBtn.isVisible()) {
        await shapeBtn.click();
        await page.waitForTimeout(200);
      }
      
      await expect(toolbar).toHaveScreenshot('toolbar-shape-selected.png', {
        maxDiffPixelRatio: 0.10,
      });
    });

    test('工具栏 - 选择文本工具', async ({ page }) => {
      const toolbar = page.locator('.unified-toolbar');
      
      // 选择文本工具
      const textBtn = app.toolbar.text;
      if (await textBtn.isVisible()) {
        await textBtn.click();
        await page.waitForTimeout(200);
      }
      
      await expect(toolbar).toHaveScreenshot('toolbar-text-selected.png', {
        maxDiffPixelRatio: 0.10,
      });
    });
  });

  test.describe('下拉菜单交互', () => {
    test('AI输入栏 - 模型下拉', async ({ page }) => {
      const aiInputBar = app.aiInputBar.container;
      
      // 关闭状态
      await expect(aiInputBar).toHaveScreenshot('ai-input-model-closed.png', {
        maxDiffPixelRatio: 0.10,
      });
      
      // 打开模型选择器
      const modelSelector = app.aiInputBar.modelSelector;
      if (await modelSelector.isVisible()) {
        await modelSelector.click();
        await page.waitForTimeout(300);
        
        // 打开状态（包含下拉菜单）
        await expect(page).toHaveScreenshot('ai-input-model-open.png', {
          maxDiffPixelRatio: 0.10,
          fullPage: true,
        });
      }
    });

    test('AI输入栏 - 尺寸下拉', async ({ page }) => {
      // 打开尺寸选择器
      const sizeSelector = app.aiInputBar.sizeSelector;
      if (await sizeSelector.isVisible()) {
        await sizeSelector.click();
        await page.waitForTimeout(300);
        
        // 打开状态
        await expect(page).toHaveScreenshot('ai-input-size-open.png', {
          maxDiffPixelRatio: 0.10,
          fullPage: true,
        });
      }
    });
  });

  test.describe('缩放交互', () => {
    test('视图导航 - 缩放变化', async ({ page }) => {
      const viewNav = app.viewNavigation.container;
      
      // 初始缩放
      await expect(viewNav).toHaveScreenshot('zoom-initial.png', {
        maxDiffPixelRatio: 0.10,
      });
      
      // 放大
      const zoomIn = app.viewNavigation.zoomIn;
      if (await zoomIn.isVisible()) {
        await zoomIn.click();
        await page.waitForTimeout(200);
        await zoomIn.click();
        await page.waitForTimeout(200);
      }
      
      await expect(viewNav).toHaveScreenshot('zoom-in.png', {
        maxDiffPixelRatio: 0.10,
      });
      
      // 缩小
      const zoomOut = app.viewNavigation.zoomOut;
      if (await zoomOut.isVisible()) {
        await zoomOut.click();
        await page.waitForTimeout(200);
        await zoomOut.click();
        await page.waitForTimeout(200);
        await zoomOut.click();
        await page.waitForTimeout(200);
        await zoomOut.click();
        await page.waitForTimeout(200);
      }
      
      await expect(viewNav).toHaveScreenshot('zoom-out.png', {
        maxDiffPixelRatio: 0.10,
      });
    });
  });

  test.describe('绘图交互', () => {
    test('画布 - 绘图前后', async ({ page }) => {
      // 空画布
      const canvas = app.canvas;
      await expect(canvas).toHaveScreenshot('canvas-empty.png', {
        maxDiffPixelRatio: 0.10,
      });
      
      // 选择画笔工具
      const pencilBtn = app.toolbar.pencil;
      if (await pencilBtn.isVisible()) {
        await pencilBtn.click();
        await page.waitForTimeout(200);
      }
      
      // 绘制
      await app.drawLine(100, 100, 300, 200);
      await app.drawLine(300, 200, 400, 100);
      await page.waitForTimeout(300);
      
      // 绘制后
      await expect(canvas).toHaveScreenshot('canvas-drawn.png', {
        maxDiffPixelRatio: 0.15, // 手绘内容可能有轻微差异
      });
    });
  });

  test.describe('悬停状态', () => {
    test('工具按钮 - 悬停效果', async ({ page }) => {
      // 使用工具栏容器内的按钮（通过 class 或 aria-label 定位）
      const toolbar = page.locator('.unified-toolbar');
      await expect(toolbar).toBeVisible();
      
      // 找到工具栏内的第一个工具按钮
      const toolBtn = toolbar.locator('.toolbar-button').first();
      
      if (await toolBtn.isVisible()) {
        // 正常状态
        await expect(toolBtn).toHaveScreenshot('button-tool-normal.png', {
          maxDiffPixelRatio: 0.10,
        });
        
        // 悬停状态
        await toolBtn.hover();
        await page.waitForTimeout(200);
        
        await expect(toolBtn).toHaveScreenshot('button-tool-hover.png', {
          maxDiffPixelRatio: 0.10,
        });
      }
    });
  });

  test.describe('输入交互', () => {
    test('AI输入栏 - 输入前后', async ({ page }) => {
      const aiInputBar = app.aiInputBar.container;
      
      // 空输入状态
      await expect(aiInputBar).toHaveScreenshot('ai-input-empty.png', {
        maxDiffPixelRatio: 0.10,
      });
      
      // 输入内容
      const textarea = app.aiInputBar.textarea;
      if (await textarea.isVisible()) {
        await textarea.fill('一只可爱的橘猫在阳光下晒太阳');
        await page.waitForTimeout(200);
      }
      
      // 有内容状态
      await expect(aiInputBar).toHaveScreenshot('ai-input-with-text.png', {
        maxDiffPixelRatio: 0.10,
      });
    });
  });
});
