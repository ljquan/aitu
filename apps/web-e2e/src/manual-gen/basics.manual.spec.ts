/**
 * @tags manual
 * 基础操作 - 用户手册生成测试
 * 生成画布操作、插入内容等基础功能的带标注截图
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

test.describe('基础操作手册', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('画布操作截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'basics',
        title: '画布操作',
        description: '画布移动、缩放、选择等基础操作',
      }),
    });

    // 截图1：工具栏 - 手形工具和选择工具
    // 使用 label 选择器精确定位按钮容器
    const toolbar = page.locator('.unified-toolbar').or(page.locator('[class*="toolbar"]')).first();
    const handTool = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /手形工具/ }) }).first();
    const selectTool = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /选择/ }) }).first();
    
    const annotations1: Annotation[] = [];
    
    // 获取实际位置并添加高亮标注
    if (await handTool.isVisible().catch(() => false)) {
      const box = await handTool.boundingBox();
      if (box) {
        annotations1.push(highlight(box.x - 4, box.y - 4, box.width + 8, box.height + 8, '手形工具 (H)', undefined, 'right'));
      }
    }
    
    if (await selectTool.isVisible().catch(() => false)) {
      const box = await selectTool.boundingBox();
      if (box) {
        annotations1.push(highlight(box.x - 4, box.y - 4, box.width + 8, box.height + 8, '选择工具 (V)', undefined, 'right'));
      }
    }
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/canvas-tools.png',
      annotations1
    );
    await testInfo.attach('canvas-tools', {
      path: 'test-results/manual-screenshots/canvas-tools.png',
      contentType: 'image/png',
    });

    // 截图2：视图导航控件
    const zoomIn = page.getByRole('button', { name: /放大/ });
    const zoomOut = page.getByRole('button', { name: /缩小/ });
    const zoomFit = page.getByRole('button', { name: /自适应/ });
    
    const annotations2: Annotation[] = [];
    
    const zoomOutCircle = await circleOnElement(zoomOut, 1);
    if (zoomOutCircle) annotations2.push(zoomOutCircle);
    
    const zoomFitCircle = await circleOnElement(zoomFit, 2);
    if (zoomFitCircle) annotations2.push(zoomFitCircle);
    
    const zoomInCircle = await circleOnElement(zoomIn, 3);
    if (zoomInCircle) annotations2.push(zoomInCircle);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/view-navigation.png',
      annotations2
    );
    await testInfo.attach('view-navigation', {
      path: 'test-results/manual-screenshots/view-navigation.png',
      contentType: 'image/png',
    });

    // 截图3：缩放菜单
    await zoomFit.click();
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'test-results/manual-screenshots/zoom-menu.png' });
    await testInfo.attach('zoom-menu', {
      path: 'test-results/manual-screenshots/zoom-menu.png',
      contentType: 'image/png',
    });
    
    await page.keyboard.press('Escape');
  });

  test('插入内容截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'basics',
        title: '插入内容',
        description: '插入图片、文本、形状等内容',
      }),
    });

    // 截图1：工具栏 - 各种插入工具
    // 使用更精确的选择器定位工具栏按钮容器（而不是内部的 radio input）
    const toolbar = page.locator('.unified-toolbar').or(page.locator('[class*="toolbar"]')).first();
    
    // 定位各个工具按钮 - 选择包含 radio 的父容器 label
    const shapeBtn = toolbar.getByRole('button', { name: /形状/ }).first();
    // 图片和文本是 radio，需要找到它们的 label 容器
    const imageLabel = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /图片/ }) }).first();
    const textLabel = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /文本/ }) }).first();
    
    const annotations1: Annotation[] = [];
    
    // 形状按钮
    if (await shapeBtn.isVisible().catch(() => false)) {
      const box = await shapeBtn.boundingBox();
      if (box) {
        console.log(`[DEBUG] 形状按钮位置: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);
        annotations1.push(highlight(box.x - 4, box.y - 4, box.width + 8, box.height + 8, '形状 (R/O)', undefined, 'right'));
      }
    }
    
    // 图片按钮 - 使用 label 容器
    if (await imageLabel.isVisible().catch(() => false)) {
      const box = await imageLabel.boundingBox();
      if (box) {
        console.log(`[DEBUG] 图片按钮位置: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);
        annotations1.push(highlight(box.x - 4, box.y - 4, box.width + 8, box.height + 8, '图片 (Cmd+U)', undefined, 'right'));
      }
    }
    
    // 文本按钮 - 使用 label 容器
    if (await textLabel.isVisible().catch(() => false)) {
      const box = await textLabel.boundingBox();
      if (box) {
        console.log(`[DEBUG] 文本按钮位置: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);
        annotations1.push(highlight(box.x - 4, box.y - 4, box.width + 8, box.height + 8, '文本 (T)', undefined, 'right'));
      }
    }
    
    console.log(`[DEBUG] 插入工具截图标注数量: ${annotations1.length}`);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/insert-tools.png',
      annotations1
    );
    await testInfo.attach('insert-tools', {
      path: 'test-results/manual-screenshots/insert-tools.png',
      contentType: 'image/png',
    });

    // 截图2：素材库入口 - 使用 label 容器
    const mediaLibraryLabel = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /素材库/ }) }).first();
    
    const annotations2: Annotation[] = [];
    if (await mediaLibraryLabel.isVisible().catch(() => false)) {
      const box = await mediaLibraryLabel.boundingBox();
      if (box) {
        console.log(`[DEBUG] 素材库按钮位置: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);
        annotations2.push(highlight(box.x - 4, box.y - 4, box.width + 8, box.height + 8, '素材库', undefined, 'right'));
      }
    }
    
    console.log(`[DEBUG] 素材库截图标注数量: ${annotations2.length}`);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/insert-from-library.png',
      annotations2
    );
    await testInfo.attach('insert-from-library', {
      path: 'test-results/manual-screenshots/insert-from-library.png',
      contentType: 'image/png',
    });
  });

  test('快捷键操作截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'basics',
        title: '快捷键操作',
        description: '常用快捷键演示',
      }),
    });

    // 创建一个形状用于演示
    const shapeBtn = page.getByRole('button', { name: /形状/ });
    await shapeBtn.click();
    await page.waitForTimeout(300);
    
    // 选择矩形
    const rectBtn = page.locator('button').filter({ hasText: '矩形' }).first();
    if (await rectBtn.isVisible()) {
      await rectBtn.click();
    }
    await page.waitForTimeout(300);
    
    // 在画布上绘制
    const canvas = page.locator('.plait-board-container');
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 300, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 450, box.y + 300);
      await page.mouse.up();
    }
    await page.waitForTimeout(500);

    // 截图：选中元素后的状态（显示选中框）
    const annotations: Annotation[] = [
      arrow(200, 150, '选中后可拖动移动', 'right'),
      arrow(200, 180, '拖动角点调整大小', 'right'),
      arrow(200, 210, 'Delete 删除元素', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/element-selected.png',
      annotations
    );
    await testInfo.attach('element-selected', {
      path: 'test-results/manual-screenshots/element-selected.png',
      contentType: 'image/png',
    });
  });
});
