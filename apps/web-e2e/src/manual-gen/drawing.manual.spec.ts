/**
 * @tags manual
 * 绘图功能 - 用户手册生成测试
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

    // 步骤 0: 初始界面（带标注）
    // 左侧工具栏的元素，标签放在右侧避免遮挡
    const pencilTool = page.getByRole('button', { name: /画笔/ });
    const annotations0: Annotation[] = [];
    const pencilHighlight = await highlightElement(pencilTool, '画笔工具 (P)', 4, undefined, 'right');
    if (pencilHighlight) annotations0.push(pencilHighlight);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/drawing-step-0.png',
      annotations0
    );
    await testInfo.attach('drawing-step-0', {
      path: 'test-results/manual-screenshots/drawing-step-0.png',
      contentType: 'image/png',
    });

    await expect(pencilTool).toBeVisible();
    await pencilTool.click();
    await page.waitForTimeout(300);
    
    // 步骤 1: 画笔子菜单（带标注）
    const annotations1: Annotation[] = [
      arrow(200, 150, '画笔类型', 'right'),
      arrow(200, 200, '颜色选择', 'right'),
      arrow(200, 250, '线条粗细', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/drawing-step-1.png',
      annotations1
    );
    await testInfo.attach('drawing-step-1', {
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
    
    // 带标注截图
    const annotations2: Annotation[] = [
      arrow(300, 200, '绘制结果', 'left'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/drawing-step-2.png',
      annotations2
    );
    await testInfo.attach('drawing-step-2', {
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

    // 步骤 1: 点击形状工具（带标注）
    // 左侧工具栏的元素，标签放在右侧避免遮挡
    const shapeTool = page.getByRole('button', { name: /形状/ });
    await expect(shapeTool).toBeVisible();
    
    const annotations1: Annotation[] = [];
    const shapeHighlight = await highlightElement(shapeTool, '形状工具', 4, undefined, 'right');
    if (shapeHighlight) annotations1.push(shapeHighlight);
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/shape-step-1.png',
      annotations1
    );
    await testInfo.attach('shape-step-1', {
      path: 'test-results/manual-screenshots/shape-step-1.png',
      contentType: 'image/png',
    });
    
    await shapeTool.click();
    await page.waitForTimeout(300);

    // 步骤 2: 在画布上创建形状
    const canvas = page.locator('.board-host-svg');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    
    if (box) {
      await page.mouse.move(box.x + 200, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 350, box.y + 300);
      await page.mouse.up();
    }
    
    await page.waitForTimeout(500);
    
    // 带标注截图
    const annotations2: Annotation[] = [
      circle(400, 250, 1),
      arrow(450, 250, '拖动角点调整大小', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/shape-step-2.png',
      annotations2
    );
    await testInfo.attach('shape-step-2', {
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

    // 步骤 1: 点击文本工具（使用 label 选择器精确定位）
    const toolbar = page.locator('.unified-toolbar').or(page.locator('[class*="toolbar"]')).first();
    const textToolContainer = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /文本/ }) }).first();
    await expect(textToolContainer).toBeVisible();
    
    // 带标注截图 - 直接获取位置
    const annotations1: Annotation[] = [];
    const textBox = await textToolContainer.boundingBox();
    if (textBox) {
      annotations1.push(highlight(textBox.x - 4, textBox.y - 4, textBox.width + 8, textBox.height + 8, '文本工具 (T)', undefined, 'right'));
    }
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/text-step-1.png',
      annotations1
    );
    await testInfo.attach('text-step-1', {
      path: 'test-results/manual-screenshots/text-step-1.png',
      contentType: 'image/png',
    });
    
    await textToolContainer.click({ force: true });
    await page.waitForTimeout(300);

    // 步骤 2: 在画布上点击
    const canvas = page.locator('.board-host-svg');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    
    if (box) {
      await page.mouse.click(box.x + 300, box.y + 300);
      await page.waitForTimeout(300);
      
      // 步骤 3: 输入文字
      await page.keyboard.type('Hello Opentu!');
    }
    
    await page.waitForTimeout(500);
    
    // 带标注截图
    const annotations2: Annotation[] = [
      arrow(200, 300, '输入文本内容', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/text-step-2.png',
      annotations2
    );
    await testInfo.attach('text-step-2', {
      path: 'test-results/manual-screenshots/text-step-2.png',
      contentType: 'image/png',
    });
  });

  test('创建思维导图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'drawing',
        title: '创建思维导图',
        description: '学习如何创建和编辑思维导图',
        steps: [
          '点击工具箱更多按钮',
          '选择 Markdown 到 Drawnix',
          '输入 Markdown 内容并插入',
        ],
      }),
    });

    // 步骤 1: 点击工具箱更多按钮，找到 Markdown 到 Drawnix
    const toolbarMore = page.getByTestId('toolbar-more');
    await expect(toolbarMore).toBeVisible();
    
    // 截图1：高亮工具箱更多按钮
    const annotations1: Annotation[] = [];
    const moreBox = await toolbarMore.boundingBox();
    if (moreBox) {
      annotations1.push(highlight(moreBox.x - 4, moreBox.y - 4, moreBox.width + 8, moreBox.height + 8, '更多工具', undefined, 'right'));
    }
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/mindmap-step-1.png',
      annotations1
    );
    await testInfo.attach('mindmap-step-1', {
      path: 'test-results/manual-screenshots/mindmap-step-1.png',
      contentType: 'image/png',
    });
    
    // 点击更多按钮打开菜单
    await toolbarMore.click();
    await page.waitForTimeout(500);
    
    // 截图1.5：展开菜单，标注思维导图按钮
    const mindmapBtn = page.getByRole('button', { name: '思维导图' });
    if (await mindmapBtn.isVisible().catch(() => false)) {
      const annotations1_5: Annotation[] = [];
      const mindmapBtnHighlight = await highlightElement(mindmapBtn, '思维导图 — M', 4, undefined, 'right');
      if (mindmapBtnHighlight) annotations1_5.push(mindmapBtnHighlight);
      
      await screenshotWithAnnotations(
        page,
        'test-results/manual-screenshots/mindmap-toolbar-menu.png',
        annotations1_5
      );
      await testInfo.attach('mindmap-toolbar-menu', {
        path: 'test-results/manual-screenshots/mindmap-toolbar-menu.png',
        contentType: 'image/png',
      });
    }
    
    // 找到并点击 "Markdown 到 Drawnix"
    const markdownBtn = page.getByRole('button', { name: 'Markdown 到 Drawnix' });
    await expect(markdownBtn).toBeVisible();
    await markdownBtn.click();
    await page.waitForTimeout(500);
    
    // 点击插入按钮（使用默认示例内容）
    const insertBtn = page.getByRole('button', { name: '插入' });
    await expect(insertBtn).toBeVisible();
    await insertBtn.click();
    await page.waitForTimeout(1000);
    
    // 按 Escape 关闭可能的弹窗
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // 步骤 2: 截图生成的思维导图 + 操作提示
    const annotations2: Annotation[] = [];
    annotations2.push(arrow(850, 200, 'Tab: 添加子节点', 'left'));
    annotations2.push(arrow(850, 250, 'Enter: 添加同级节点', 'left'));
    annotations2.push(arrow(850, 300, 'Delete: 删除节点', 'left'));
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/mindmap-step-2.png',
      annotations2
    );
    await testInfo.attach('mindmap-step-2', {
      path: 'test-results/manual-screenshots/mindmap-step-2.png',
      contentType: 'image/png',
    });
  });

  test('创建流程图', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'manual',
      description: JSON.stringify({
        category: 'drawing',
        title: '创建流程图',
        description: '学习如何创建和编辑流程图',
        steps: [
          '点击左侧工具栏的流程图图标',
          '选择需要的形状类型',
          '在画布上拖拽创建形状',
          '连接形状创建流程',
        ],
      }),
    });

    // 步骤 1: 找到流程图工具
    // 左侧工具栏的元素，标签放在右侧避免遮挡
    const flowchartTool = page.getByRole('button', { name: /流程图/ }).or(
      page.locator('button').filter({ hasText: '流程图' })
    ).first();
    
    // 带标注截图
    const annotations1: Annotation[] = [];
    if (await flowchartTool.isVisible()) {
      const flowchartHighlight = await highlightElement(flowchartTool, '流程图工具', 4, undefined, 'right');
      if (flowchartHighlight) annotations1.push(flowchartHighlight);
    }
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/flowchart-step-1.png',
      annotations1
    );
    await testInfo.attach('flowchart-step-1', {
      path: 'test-results/manual-screenshots/flowchart-step-1.png',
      contentType: 'image/png',
    });

    // 点击流程图工具
    if (await flowchartTool.isVisible()) {
      await flowchartTool.click();
      await page.waitForTimeout(300);
      
      // 截图：流程图形状选择
      const annotations2: Annotation[] = [
        circle(150, 200, 1),
        arrow(200, 200, '开始/结束', 'right'),
        circle(150, 250, 2),
        arrow(200, 250, '处理步骤', 'right'),
        circle(150, 300, 3),
        arrow(200, 300, '判断条件', 'right'),
      ];
      
      await screenshotWithAnnotations(
        page,
        'test-results/manual-screenshots/flowchart-step-2.png',
        annotations2
      );
      await testInfo.attach('flowchart-step-2', {
        path: 'test-results/manual-screenshots/flowchart-step-2.png',
        contentType: 'image/png',
      });
    } else {
      // 如果流程图工具不可见，使用形状工具演示
      await page.screenshot({ path: 'test-results/manual-screenshots/flowchart-step-2.png' });
      await testInfo.attach('flowchart-step-2', {
        path: 'test-results/manual-screenshots/flowchart-step-2.png',
        contentType: 'image/png',
      });
    }

    // 步骤 3: 连接形状的提示
    const annotations3: Annotation[] = [
      arrow(200, 350, '拖动连接点创建连线', 'right'),
      arrow(200, 400, '双击编辑文本', 'right'),
    ];
    
    await screenshotWithAnnotations(
      page,
      'test-results/manual-screenshots/flowchart-step-3.png',
      annotations3
    );
    await testInfo.attach('flowchart-step-3', {
      path: 'test-results/manual-screenshots/flowchart-step-3.png',
      contentType: 'image/png',
    });
  });
});
