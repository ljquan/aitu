/**
 * @tags manual
 * 进阶功能 - 用户手册生成测试
 * 这些测试会生成用于用户手册的截图
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

test.describe('进阶功能手册', () => {
  test('工具箱截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '工具箱',
        description: '工具箱功能',
      }),
    });

    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 点击工具箱按钮
    // 左侧工具栏的元素，标签放在右侧避免遮挡
    const toolboxBtn = page.getByRole('button', { name: /打开工具箱/ });
    await expect(toolboxBtn).toBeVisible();
    
    // 带标注截图：工具箱入口
    const annotations0: Annotation[] = [];
    const toolboxHighlight = await highlightElement(toolboxBtn, '点击打开工具箱', 4, undefined, 'right');
    if (toolboxHighlight) annotations0.push(toolboxHighlight);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/toolbox-entry.png',
      annotations0
    );
    await testInfo.attach('toolbox-entry', {
      path: 'test-results/manual-screenshots/toolbox-entry.png',
      contentType: 'image/png',
    });
    
    await toolboxBtn.click();
    await page.waitForTimeout(500);

    // 带标注截图：工具箱抽屉
    const toolboxDrawer = page.locator('[data-testid="toolbox-drawer"]').or(page.locator('.toolbox-drawer'));
    const annotations1: Annotation[] = [
      arrow(120, 200, '内容工具', 'right'),
      arrow(120, 350, 'AI 工具', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/toolbox-drawer.png',
      annotations1
    );
    await testInfo.attach('toolbox-drawer', {
      path: 'test-results/manual-screenshots/toolbox-drawer.png',
      contentType: 'image/png',
    });

    // 点击第一个工具的新窗口按钮打开工具窗口
    const newWindowBtn = page.locator('[data-testid="toolbox-drawer"]').locator('button').filter({ hasText: '' }).nth(1);
    if (await newWindowBtn.isVisible()) {
      await newWindowBtn.click();
      await page.waitForTimeout(1000);
      
      // 截图：工具窗口
      await page.screenshot({ path: 'test-results/manual-screenshots/toolbox-window.png' });
      await testInfo.attach('toolbox-window', {
        path: 'test-results/manual-screenshots/toolbox-window.png',
        contentType: 'image/png',
      });
    }
  });

  test('调试面板截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '调试面板',
        description: '使用调试面板排查问题',
      }),
    });

    // 访问调试面板
    await page.goto('/sw-debug.html');
    await page.waitForTimeout(2000);

    // 带标注截图调试面板
    const annotations: Annotation[] = [
      circle(100, 100, 1),
      arrow(150, 100, 'Service Worker 状态', 'right'),
      circle(100, 200, 2),
      arrow(150, 200, '缓存存储信息', 'right'),
      circle(100, 300, 3),
      arrow(150, 300, '任务队列状态', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/debug-panel.png',
      annotations
    );
    await testInfo.attach('debug-panel', {
      path: 'test-results/manual-screenshots/debug-panel.png',
      contentType: 'image/png',
    });
  });

  test('编辑操作截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '编辑操作',
        description: '选择和编辑元素',
      }),
    });

    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 点击形状按钮打开子菜单
    const shapeBtn = page.getByRole('button', { name: /形状/ });
    await expect(shapeBtn).toBeVisible();
    await shapeBtn.click();
    await page.waitForTimeout(500);

    // 从形状子菜单中选择矩形 - 使用更宽松的选择器
    const rectOption = page.getByRole('button', { name: '矩形' }).or(
      page.locator('button:has-text("矩形")')
    ).first();
    
    // 如果子菜单没打开，直接在画布上画
    const canvas = page.locator('.plait-board-container');
    const box = await canvas.boundingBox();
    
    if (box) {
      // 直接在画布上绘制形状（使用当前选中的形状工具）
      await page.mouse.move(box.x + 300, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 500, box.y + 350);
      await page.mouse.up();
    }
    await page.waitForTimeout(500);

    // 带标注截图：形状被选中
    const annotations: Annotation[] = [
      arrow(200, 200, '拖动移动元素', 'right'),
      arrow(200, 250, '拖动角点调整大小', 'right'),
      arrow(200, 300, 'Delete 删除元素', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/edit-selected.png',
      annotations
    );
    await testInfo.attach('edit-selected', {
      path: 'test-results/manual-screenshots/edit-selected.png',
      contentType: 'image/png',
    });
  });

  test('项目管理截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '项目管理',
        description: '管理项目和文件',
      }),
    });

    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 打开项目抽屉
    const projectBtn = page.getByRole('button', { name: /打开项目/ });
    await expect(projectBtn).toBeVisible();
    await projectBtn.click();
    await page.waitForTimeout(500);

    // 等待抽屉出现并获取位置
    const drawer = page.locator('[data-testid="project-drawer"]').or(page.locator('.project-drawer')).or(page.locator('.t-drawer'));
    const drawerBox = await drawer.boundingBox().catch(() => null);
    
    // 基于抽屉位置的标注
    const annotations: Annotation[] = [];
    const baseX = drawerBox ? drawerBox.x + 30 : 250;
    const baseY = drawerBox ? drawerBox.y + 60 : 100;
    
    // 查找新建项目按钮
    const newProjectBtn = page.locator('button').filter({ hasText: /新建|创建/ }).first();
    if (await newProjectBtn.isVisible().catch(() => false)) {
      const btnCircle = await circleOnElement(newProjectBtn, 1, { x: -30 });
      if (btnCircle) {
        annotations.push(btnCircle);
        annotations.push(arrow(btnCircle.x + 40, btnCircle.y, '新建项目', 'right'));
      }
    } else {
      annotations.push(circle(baseX, baseY, 1));
      annotations.push(arrow(baseX + 50, baseY, '新建项目', 'right'));
    }
    
    // 项目列表区域
    annotations.push(circle(baseX, baseY + 100, 2));
    annotations.push(arrow(baseX + 50, baseY + 100, '项目列表', 'right'));
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/project-drawer.png',
      annotations
    );
    await testInfo.attach('project-drawer', {
      path: 'test-results/manual-screenshots/project-drawer.png',
      contentType: 'image/png',
    });
  });

  test('素材库截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '素材库',
        description: '管理图片和视频素材',
      }),
    });

    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 点击素材库按钮（使用 label 选择器）
    const toolbar = page.locator('.unified-toolbar').or(page.locator('[class*="toolbar"]')).first();
    const mediaLibraryBtn = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /素材库/ }) }).first();
    await expect(mediaLibraryBtn).toBeVisible();
    await mediaLibraryBtn.click();
    await page.waitForTimeout(500);

    // 带标注截图：素材库面板
    const annotations: Annotation[] = [
      arrow(120, 150, '筛选类型', 'right'),
      arrow(120, 250, 'AI 生成素材', 'right'),
      arrow(120, 350, '已上传素材', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/media-library.png',
      annotations
    );
    await testInfo.attach('media-library', {
      path: 'test-results/manual-screenshots/media-library.png',
      contentType: 'image/png',
    });
  });

  test('设置对话框截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '设置',
        description: '配置应用设置',
      }),
    });

    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 点击菜单按钮
    const menuBtn = page.getByRole('button', { name: /应用菜单/ });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    await page.waitForTimeout(500);

    // 基于菜单项实际位置的标注
    const settingsItem = page.getByRole('button', { name: '设置' });
    const backupItemInMenu = page.getByRole('button', { name: /备份.*恢复/ });
    const helpItem = page.getByRole('button', { name: /帮助|使用说明/ });
    
    const annotations1: Annotation[] = [];
    
    // 标注设置菜单项
    if (await settingsItem.isVisible().catch(() => false)) {
      const settingsCircle = await circleOnElement(settingsItem, 1, { x: -30 });
      if (settingsCircle) {
        annotations1.push(settingsCircle);
        annotations1.push(arrow(settingsCircle.x + 40, settingsCircle.y, '设置', 'right'));
      }
    }
    
    // 标注备份/恢复菜单项
    if (await backupItemInMenu.isVisible().catch(() => false)) {
      const backupCircle = await circleOnElement(backupItemInMenu, 2, { x: -30 });
      if (backupCircle) {
        annotations1.push(backupCircle);
        annotations1.push(arrow(backupCircle.x + 40, backupCircle.y, '备份/恢复', 'right'));
      }
    }
    
    // 标注帮助菜单项
    if (await helpItem.isVisible().catch(() => false)) {
      const helpCircle = await circleOnElement(helpItem, 3, { x: -30 });
      if (helpCircle) {
        annotations1.push(helpCircle);
        annotations1.push(arrow(helpCircle.x + 40, helpCircle.y, '帮助', 'right'));
      }
    }
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/app-menu.png',
      annotations1
    );
    await testInfo.attach('app-menu', {
      path: 'test-results/manual-screenshots/app-menu.png',
      contentType: 'image/png',
    });

    // 点击设置
    await expect(settingsItem).toBeVisible();
    await settingsItem.click();
    await page.waitForTimeout(500);

    // 等待设置对话框并获取位置
    const settingsDialog = page.locator('.t-dialog').or(page.locator('[role="dialog"]'));
    const dialogBox = await settingsDialog.boundingBox().catch(() => null);
    
    // 基于对话框位置的标注
    const annotations2: Annotation[] = [];
    const dialogX = dialogBox ? dialogBox.x + 50 : 150;
    const dialogY = dialogBox ? dialogBox.y + 100 : 200;
    
    annotations2.push(arrow(dialogX, dialogY, 'API 配置', 'right'));
    annotations2.push(arrow(dialogX, dialogY + 80, '主题设置', 'right'));
    annotations2.push(arrow(dialogX, dialogY + 160, '语言选择', 'right'));
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/settings-dialog.png',
      annotations2
    );
    await testInfo.attach('settings-dialog', {
      path: 'test-results/manual-screenshots/settings-dialog.png',
      contentType: 'image/png',
    });
  });

  test('备份恢复截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '备份恢复',
        description: '备份和恢复数据',
      }),
    });

    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 点击菜单按钮
    const menuBtn = page.getByRole('button', { name: /应用菜单/ });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    await page.waitForTimeout(500);

    // 点击备份恢复（使用 button，名称是 "备份 / 恢复"）
    const backupItem = page.getByRole('button', { name: /备份.*恢复/ });
    await expect(backupItem).toBeVisible();
    await backupItem.click();
    await page.waitForTimeout(800);

    // 等待对话框出现
    const dialog = page.locator('.t-dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    
    // 定位对话框中的实际元素
    const exportBtn = page.locator('button').filter({ hasText: '导出备份' }).first();
    const restoreTab = page.locator('text=恢复').first();
    
    // 基于实际元素位置创建标注
    const annotations: Annotation[] = [];
    
    // 标注1: 导出备份按钮
    if (await exportBtn.isVisible()) {
      const exportCircle = await circleOnElement(exportBtn, 1, { x: -50 });
      if (exportCircle) {
        annotations.push(exportCircle);
        annotations.push(arrow(exportCircle.x + 50, exportCircle.y, '导出备份', 'right'));
      }
    }
    
    // 标注2: 恢复标签页 - 在对话框内查找
    if (await restoreTab.isVisible()) {
      const restoreCircle = await circleOnElement(restoreTab, 2, { x: -50 });
      if (restoreCircle) {
        annotations.push(restoreCircle);
        annotations.push(arrow(restoreCircle.x + 50, restoreCircle.y, '导入备份', 'right'));
      }
    }
    
    // 如果没有找到元素，使用对话框相对位置的备用标注
    if (annotations.length === 0) {
      const dialogBox = await dialog.boundingBox();
      if (dialogBox) {
        annotations.push(circle(dialogBox.x + 100, dialogBox.y + 80, 1));
        annotations.push(arrow(dialogBox.x + 150, dialogBox.y + 80, '导出备份', 'right'));
        annotations.push(circle(dialogBox.x + 300, dialogBox.y + 80, 2));
        annotations.push(arrow(dialogBox.x + 350, dialogBox.y + 80, '导入备份', 'right'));
      }
    }
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/backup-restore.png',
      annotations
    );
    await testInfo.attach('backup-restore', {
      path: 'test-results/manual-screenshots/backup-restore.png',
      contentType: 'image/png',
    });
  });

  test('图片预览编辑截图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'advanced',
        title: '图片预览编辑',
        description: '预览和编辑图片',
      }),
    });

    await page.goto('/');
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 先打开素材库看看有没有图片（使用 label 选择器）
    const toolbar = page.locator('.unified-toolbar').or(page.locator('[class*="toolbar"]')).first();
    const mediaLibraryBtn = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /素材库/ }) }).first();
    await expect(mediaLibraryBtn).toBeVisible();
    await mediaLibraryBtn.click();
    await page.waitForTimeout(500);

    // 如果有素材，双击第一个打开预览
    const firstAsset = page.locator('[data-testid="asset-item"]').or(page.locator('.asset-item')).first();
    if (await firstAsset.isVisible()) {
      await firstAsset.dblclick();
      await page.waitForTimeout(500);
      
      // 带标注截图：图片预览界面
      const annotations: Annotation[] = [
        circle(50, 50, 1),
        arrow(100, 50, '关闭预览', 'right'),
        arrow(100, 400, '缩放控制', 'right'),
        arrow(100, 500, '编辑工具', 'right'),
      ];
      
      await screenshotWithAnnotations(
        page,
        'test-results/manual-screenshots/image-preview.png',
        annotations
      );
      await testInfo.attach('image-preview', {
        path: 'test-results/manual-screenshots/image-preview.png',
        contentType: 'image/png',
      });
    } else {
      // 如果没有素材，截一个空状态
      await page.screenshot({ path: 'test-results/manual-screenshots/image-preview-empty.png' });
      await testInfo.attach('image-preview-empty', {
        path: 'test-results/manual-screenshots/image-preview-empty.png',
        contentType: 'image/png',
      });
    }
  });
});
