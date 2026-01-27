/**
 * GIF 录制测试
 * 
 * 用于生成用户手册中的 GIF 动图演示
 * 
 * 使用方法：
 * 1. 运行 `pnpm manual:record` 录制操作
 * 2. 将录制的代码复制到下面对应的测试中
 * 3. 运行 `pnpm manual:gif` 生成 GIF
 */

import { test, expect, Page } from '@playwright/test';

/**
 * 显示快捷键提示
 * 在屏幕右下角显示按键提示，用于 GIF 演示
 */
async function showKeyHint(page: Page, key: string, duration: number = 1500) {
  await page.evaluate(({ keyText, dur }) => {
    // 创建或获取提示容器
    let container = document.getElementById('key-hint-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'key-hint-container';
      container.style.cssText = `
        position: fixed;
        bottom: 120px;
        right: 50px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    
    // 创建提示元素
    const hint = document.createElement('div');
    hint.style.cssText = `
      background: linear-gradient(135deg, #F39C12 0%, #E67E22 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 10px;
      font-size: 20px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: keyHintIn 0.3s ease-out;
    `;
    
    // 添加提示内容
    hint.innerHTML = `<span>${keyText}</span>`;
    
    // 添加动画样式
    if (!document.getElementById('key-hint-styles')) {
      const style = document.createElement('style');
      style.id = 'key-hint-styles';
      style.textContent = `
        @keyframes keyHintIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes keyHintOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(20px); }
        }
      `;
      document.head.appendChild(style);
    }
    
    container.appendChild(hint);
    
    // 定时移除（使用传入的 duration）
    setTimeout(() => {
      hint.style.animation = 'keyHintOut 0.3s ease-in forwards';
      setTimeout(() => hint.remove(), 300);
    }, dur - 300);
  }, { keyText: key, dur: duration });
  
  await page.waitForTimeout(duration);
}

/**
 * 带提示的按键操作
 */
async function pressWithHint(page: Page, key: string, displayKey?: string) {
  const display = displayKey || key.toUpperCase();
  await showKeyHint(page, display);
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

/**
 * 显示点击效果
 * 在元素上显示红色圆圈动画，标识点击位置
 */
async function showClickEffect(page: Page, x: number, y: number, label?: string) {
  await page.evaluate(({ posX, posY, text }) => {
    // 创建点击效果容器
    const effect = document.createElement('div');
    effect.style.cssText = `
      position: fixed;
      left: ${posX}px;
      top: ${posY}px;
      transform: translate(-50%, -50%);
      z-index: 999999;
      pointer-events: none;
    `;
    
    // 红色圆圈
    const circle = document.createElement('div');
    circle.style.cssText = `
      width: 40px;
      height: 40px;
      border: 4px solid #E91E63;
      border-radius: 50%;
      background: rgba(233, 30, 99, 0.2);
      animation: clickPulse 0.8s ease-out;
    `;
    effect.appendChild(circle);
    
    // 标签文字
    if (text) {
      const labelEl = document.createElement('div');
      labelEl.style.cssText = `
        position: absolute;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        background: #E91E63;
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      labelEl.textContent = text;
      effect.appendChild(labelEl);
    }
    
    // 添加动画样式
    if (!document.getElementById('click-effect-styles')) {
      const style = document.createElement('style');
      style.id = 'click-effect-styles';
      style.textContent = `
        @keyframes clickPulse {
          0% { transform: scale(0.5); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
          100% { transform: scale(1); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(effect);
    
    // 移除效果
    setTimeout(() => effect.remove(), 1500);
  }, { posX: x, posY: y, text: label });
}

// 是否已记录第一次点击
let firstClickLogged = false;

/**
 * 点击元素并显示点击效果
 */
async function clickWithEffect(page: Page, locator: ReturnType<Page['locator']>, label?: string, waitAfter: number = 1500) {
  // 记录第一次点击的时间（用于计算裁剪点）
  if (!firstClickLogged && testStartTime) {
    const elapsed = (Date.now() - testStartTime) / 1000;
    // 输出裁剪建议（第一次点击前 1 秒开始）
    const trimStart = Math.max(0, elapsed - 1).toFixed(1);
    console.log(`\n📍 第一次点击时间: ${elapsed.toFixed(1)}s`);
    console.log(`✂️  建议裁剪参数: --trim ${trimStart}\n`);
    firstClickLogged = true;
  }
  
  const box = await locator.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    
    // 先显示点击效果
    await showClickEffect(page, x, y, label);
    await page.waitForTimeout(500);
    
    // 再执行点击
    await locator.click();
    await page.waitForTimeout(waitAfter);
  } else {
    await locator.click();
    await page.waitForTimeout(waitAfter);
  }
}

/**
 * 重置第一次点击记录（用于多个测试）
 */
function resetFirstClick() {
  firstClickLogged = false;
}

// 记录测试开始时间，用于计算裁剪点
let testStartTime: number;

test.describe('GIF 动图录制', () => {
  test.beforeEach(async ({ page }) => {
    // 视频从这里开始录制，记录时间
    testStartTime = Date.now();
    firstClickLogged = false;
    
    await page.goto('/');
    // 等待应用加载
    const drawnix = page.locator('.drawnix');
    await expect(drawnix).toBeVisible({ timeout: 10000 });
    // 等待 UI 完全稳定
    await page.waitForTimeout(2000);
  });

  test('思维导图创建演示', async ({ page }) => {
    // 使用 Markdown 到 Drawnix 创建思维导图
    // 注意：beforeEach 已等待 2 秒，转 GIF 时用 --trim 2 裁剪
    
    // 点击工具箱更多按钮
    await clickWithEffect(
      page, 
      page.getByTestId('toolbar-more'), 
      '点击更多工具',
      1500
    );
    
    // 点击 Markdown 到 Drawnix
    await clickWithEffect(
      page, 
      page.getByRole('button', { name: 'Markdown 到 Drawnix' }), 
      '选择 Markdown 转换',
      1500
    );
    
    // 点击插入（使用默认示例）
    await clickWithEffect(
      page, 
      page.getByRole('button', { name: '插入' }), 
      '点击插入',
      2500
    );
    
    // 关闭对话框
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    
    // 演示编辑思维导图
    // 点击思维导图中的一个节点
    const mindNode = page.locator('.mind-node-content').first();
    if (await mindNode.isVisible().catch(() => false)) {
      await clickWithEffect(page, mindNode, '点击节点进入编辑', 1500);
      
      // Tab 添加子节点
      await showKeyHint(page, 'Tab：添加子节点', 2000);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(1500);
      
      await page.keyboard.type('新子节点', { delay: 200 });
      await page.waitForTimeout(1500);
      
      // Enter 添加同级节点
      await showKeyHint(page, 'Enter：添加同级节点', 2000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      
      await page.keyboard.type('同级节点', { delay: 200 });
      await page.waitForTimeout(2000);
    }
    
    // 点击空白处完成编辑
    await page.mouse.click(100, 100);
    await page.waitForTimeout(2500);
  });

  test('画笔绘制演示', async ({ page }) => {
    // 按 P 切换到画笔
    await showKeyHint(page, 'P - 画笔工具');
    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    
    const canvas = page.locator('.board-host-svg');
    const box = await canvas.boundingBox();
    
    if (box) {
      const startX = box.x + 200;
      const startY = box.y + 200;
      
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      
      // 绘制波浪线
      for (let i = 0; i < 10; i++) {
        const x = startX + i * 30;
        const y = startY + Math.sin(i * 0.5) * 50;
        await page.mouse.move(x, y);
        await page.waitForTimeout(50);
      }
      
      await page.mouse.up();
    }
    
    await page.waitForTimeout(1000);
  });

  test('AI 图片生成演示', async ({ page }) => {
    const inputBar = page.locator('[data-testid="ai-input-textarea"]');
    
    if (await inputBar.isVisible().catch(() => false)) {
      await inputBar.click();
      await page.waitForTimeout(300);
      
      await page.keyboard.type('一只可爱的橘猫', { delay: 100 });
      await page.waitForTimeout(1000);
    }
    
    await page.waitForTimeout(1000);
  });

  test('工具箱操作演示', async ({ page }) => {
    // 工具箱完整操作流程：打开 → 使用工具 → 窗口控制 → 关闭
    
    // 步骤 1: 点击工具箱按钮
    await clickWithEffect(
      page, 
      page.getByTestId('toolbar-toolbox'), 
      '打开工具箱',
      1500
    );
    
    // 步骤 2: 点击第一个工具的「新窗口」按钮
    const openWindowBtn = page.locator('.tool-item__action-btn.tool-item__action-btn--open-window').first();
    await clickWithEffect(
      page, 
      openWindowBtn, 
      '在新窗口打开工具',
      2000
    );
    
    // 步骤 3: 演示窗口控制 - 最大化
    await showKeyHint(page, '最大化窗口', 1500);
    const maxBtn = page.locator('.wb-max');
    if (await maxBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, maxBtn, '最大化', 1500);
    }
    
    // 步骤 4: 演示窗口控制 - 还原
    await showKeyHint(page, '还原窗口大小', 1500);
    const minBtn = page.locator('.wb-min');
    if (await minBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, minBtn, '还原', 1500);
    }
    
    // 步骤 5: 演示窗口控制 - 分屏模式
    await showKeyHint(page, '分屏显示', 1500);
    const splitBtn = page.locator('.wb-split').first();
    if (await splitBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, splitBtn, '分屏', 1500);
    }
    
    // 步骤 6: 演示窗口控制 - 插入画布
    await showKeyHint(page, '插入到画布', 1500);
    const insertBtn = page.locator('.wb-insert-canvas').first();
    if (await insertBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, insertBtn, '插入画布', 1500);
    }
    
    // 步骤 7: 关闭窗口
    await page.waitForTimeout(1000);
    const closeBtn = page.locator('.wb-close').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, closeBtn, '关闭', 1000);
    }
    
    // 最终等待
    await page.waitForTimeout(2000);
  });

  test('素材库操作演示', async ({ page }) => {
    // 素材库完整操作流程：打开 → 上传 → 视图切换 → 批量操作 → 下载/插入
    
    // 步骤 1: 打开素材库
    await showKeyHint(page, '打开素材库', 1500);
    const toolbar = page.locator('.unified-toolbar').or(page.locator('[class*="toolbar"]')).first();
    const mediaLibraryBtn = toolbar.locator('label').filter({ has: page.getByRole('radio', { name: /素材库/ }) }).first();
    await clickWithEffect(
      page, 
      mediaLibraryBtn, 
      '素材库',
      1500
    );
    
    // 步骤 2: 演示上传功能
    await showKeyHint(page, '上传图片到素材库', 2000);
    const uploadBtn = page.getByTestId('media-library-grid').getByRole('button', { name: '上传' });
    await clickWithEffect(page, uploadBtn, '上传', 1000);
    
    // 注意：文件上传需要实际文件路径，这里只演示点击
    // 实际测试时需要准备测试图片
    // await uploadBtn.setInputFiles('path/to/test-image.png');
    await page.waitForTimeout(1500);
    
    // 步骤 3: 演示视图模式切换
    await showKeyHint(page, '切换视图模式', 1500);
    
    // 紧凑网格
    const compactGridBtn = page.getByRole('button', { name: '紧凑网格' });
    if (await compactGridBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, compactGridBtn, '紧凑网格', 1000);
    }
    
    // 列表视图
    const listViewBtn = page.getByRole('button', { name: '列表视图' });
    if (await listViewBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, listViewBtn, '列表视图', 1000);
    }
    
    // 默认网格
    const defaultGridBtn = page.getByRole('button', { name: '默认网格' });
    if (await defaultGridBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, defaultGridBtn, '默认网格', 1000);
    }
    
    // 步骤 4: 演示批量选择模式
    await showKeyHint(page, '批量选择素材', 1500);
    const batchSelectBtn = page.getByRole('button', { name: '批量选择' });
    if (await batchSelectBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, batchSelectBtn, '批量选择', 1500);
    }
    
    // 选择第一个素材
    const firstMedia = page.getByTestId('media-library-grid').locator('[role="button"]').first();
    if (await firstMedia.isVisible().catch(() => false)) {
      await clickWithEffect(page, firstMedia, '选择素材', 1000);
    }
    
    // 退出批量选择
    const cancelBtn = page.getByRole('button', { name: '取消' });
    if (await cancelBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, cancelBtn, '取消选择', 1000);
    }
    
    // 步骤 5: 演示缩放滑块
    await showKeyHint(page, '调整缩略图大小', 1500);
    const slider = page.getByRole('slider');
    if (await slider.isVisible().catch(() => false)) {
      // 调整滑块值
      await slider.fill('130');
      await page.waitForTimeout(1000);
    }
    
    // 步骤 6: 演示素材操作（选中素材）
    const mediaItem = page.getByTestId('media-library-grid').locator('[role="button"]').first();
    if (await mediaItem.isVisible().catch(() => false)) {
      await clickWithEffect(page, mediaItem, '选择素材', 1500);
      
      // 下载按钮
      await showKeyHint(page, '下载素材', 1500);
      const downloadBtn = page.getByRole('button', { name: '下载' });
      if (await downloadBtn.isVisible().catch(() => false)) {
        await clickWithEffect(page, downloadBtn, '下载', 1000);
      }
      
      // 等待下载完成
      await page.waitForTimeout(1000);
      
      // 插入到画布
      await showKeyHint(page, '插入到画布', 1500);
      const insertBtn = page.getByRole('button', { name: '插入' });
      if (await insertBtn.isVisible().catch(() => false)) {
        await clickWithEffect(page, insertBtn, '插入', 1500);
      }
    }
    
    // 步骤 7: 演示排序功能
    await showKeyHint(page, '切换排序方式', 1500);
    const sortBtn = page.locator('.lucide.lucide-arrow-down-za');
    if (await sortBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, sortBtn, '排序', 1000);
      
      // 选择排序选项
      const sortOption = page.locator('.media-library-grid__sort-options > div').nth(2);
      if (await sortOption.isVisible().catch(() => false)) {
        await clickWithEffect(page, sortOption, '按大小排序', 1000);
      }
    }
    
    // 最终等待
    await page.waitForTimeout(2000);
  });

  test('项目管理演示', async ({ page }) => {
    // 项目管理完整流程：打开 → 新建文件夹/画板 → 重命名 → 切换 → 导入/导出
    
    // 步骤 1: 打开项目抽屉
    await showKeyHint(page, '打开项目管理', 1500);
    const projectBtn = page.getByRole('button', { name: /打开项目/ });
    if (await projectBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, projectBtn, '项目管理', 1500);
    }
    
    // 步骤 2: 新建文件夹
    await showKeyHint(page, '新建文件夹', 1500);
    const newFolderBtn = page.getByRole('button', { name: '新建文件夹' });
    if (await newFolderBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, newFolderBtn, '新建文件夹', 1500);
      
      // 重命名文件夹
      const folderNode = page.getByText('新建文件夹').nth(1);
      if (await folderNode.isVisible().catch(() => false)) {
        await folderNode.dblclick();
        await page.waitForTimeout(500);
        
        const nameInput = page.getByRole('textbox', { name: /请输入/ });
        if (await nameInput.isVisible().catch(() => false)) {
          await nameInput.fill('目录1');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1000);
        }
      }
    }
    
    // 步骤 3: 在文件夹中新建画板
    await showKeyHint(page, '在文件夹中新建画板', 1500);
    // 展开文件夹的菜单
    const folderMenu = page.locator('.project-drawer-node__actions > .t-button').first();
    if (await folderMenu.isVisible().catch(() => false)) {
      await clickWithEffect(page, folderMenu, '文件夹菜单', 1000);
      
      // 点击下拉菜单中的"新建画板"
      const newBoardBtn = page.locator('.t-dropdown__item-text').filter({ hasText: '新建画板' });
      if (await newBoardBtn.isVisible().catch(() => false)) {
        await clickWithEffect(page, newBoardBtn, '新建画板', 1000);
        
        // 输入画板名称
        const boardNameInput = page.getByRole('textbox', { name: /请输入/ });
        if (await boardNameInput.isVisible().catch(() => false)) {
          await boardNameInput.fill('画布1');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1500);
        }
      }
    }
    
    // 步骤 4: 演示画板切换
    await showKeyHint(page, '切换画板', 1500);
    const myBoard = page.getByText('我的画板').first();
    if (await myBoard.isVisible().catch(() => false)) {
      await clickWithEffect(page, myBoard, '切换到其他画板', 1000);
    }
    
    // 切换回新建的画板
    const newBoard = page.getByText('画布').first();
    if (await newBoard.isVisible().catch(() => false)) {
      await clickWithEffect(page, newBoard, '切回新画板', 1000);
    }
    
    // 步骤 5: 重命名画板
    await showKeyHint(page, '重命名画板', 1500);
    if (await newBoard.isVisible().catch(() => false)) {
      await newBoard.dblclick();
      await page.waitForTimeout(500);
      
      const renameInput = page.getByRole('textbox', { name: /请输入/ });
      if (await renameInput.isVisible().catch(() => false)) {
        await renameInput.fill('画布重命名1');
        await page.waitForTimeout(500);
        // 点击外部保存
        await page.locator('.project-drawer-node__row--active').click();
        await page.waitForTimeout(1000);
      }
    }
    
    // 步骤 6: 新建更多画板
    await showKeyHint(page, '继续新建画板', 1500);
    const newBoardBtn2 = page.getByRole('button', { name: '新建画板' });
    if (await newBoardBtn2.isVisible().catch(() => false)) {
      await clickWithEffect(page, newBoardBtn2, '新建画板', 1000);
      
      const boardNameInput2 = page.getByRole('textbox', { name: /请输入/ });
      if (await boardNameInput2.isVisible().catch(() => false)) {
        await boardNameInput2.fill('新建画布1');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      }
    }
    
    // 步骤 7: 演示搜索功能
    await showKeyHint(page, '搜索画板', 1500);
    const searchInput = page.getByTestId('project-drawer').getByRole('textbox', { name: /搜索/ });
    if (await searchInput.isVisible().catch(() => false)) {
      await clickWithEffect(page, searchInput, '搜索', 500);
      await page.keyboard.type('画布', { delay: 150 });
      await page.waitForTimeout(1500);
      
      // 清空搜索
      await searchInput.clear();
      await page.waitForTimeout(1000);
    }
    
    // 步骤 8: 导入/导出功能
    await showKeyHint(page, '导入/导出项目', 1500);
    const importBtn = page.getByRole('button', { name: '导入' });
    if (await importBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, importBtn, '导入', 1000);
    }
    
    const exportBtn = page.getByRole('button', { name: '导出' });
    if (await exportBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, exportBtn, '导出', 1000);
    }
    
    // 步骤 9: 关闭项目抽屉
    await page.waitForTimeout(1000);
    const closeBtn = page.getByTestId('project-drawer').getByRole('button', { name: /关闭/ });
    if (await closeBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, closeBtn, '关闭', 1000);
    }
    
    // 最终等待
    await page.waitForTimeout(2000);
  });

  test('备份恢复演示', async ({ page }) => {
    // 备份恢复完整流程：打开 → 备份 → 恢复
    
    // 步骤 1: 打开应用菜单
    await showKeyHint(page, '打开应用菜单', 1500);
    const menuBtn = page.getByRole('button', { name: /应用菜单/ });
    if (await menuBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, menuBtn, '应用菜单', 1500);
    }
    
    // 步骤 2: 打开备份/恢复对话框
    await showKeyHint(page, '备份与恢复', 1500);
    const backupBtn = page.getByRole('button', { name: /备份.*恢复/ });
    if (await backupBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, backupBtn, '备份/恢复', 1500);
    }
    
    // 步骤 3: 演示备份选项
    await showKeyHint(page, '选择备份内容', 1500);
    const checkboxes = page.locator('.t-checkbox__input');
    const firstCheckbox = checkboxes.first();
    if (await firstCheckbox.isVisible().catch(() => false)) {
      // 演示勾选
      await clickWithEffect(page, firstCheckbox, '选择项目', 1000);
      await page.waitForTimeout(500);
    }
    
    // 步骤 4: 开始备份
    await showKeyHint(page, '开始备份', 1500);
    const startBackupBtn = page.getByRole('button', { name: /开始备份/ });
    if (await startBackupBtn.isVisible().catch(() => false)) {
      await clickWithEffect(page, startBackupBtn, '开始备份', 1500);
      
      // 等待下载开始
      await page.waitForTimeout(2000);
    }
    
    // 步骤 5: 切换到恢复标签页
    await showKeyHint(page, '恢复备份', 1500);
    const restoreTab = page.getByRole('button', { name: '恢复' });
    if (await restoreTab.isVisible().catch(() => false)) {
      await clickWithEffect(page, restoreTab, '恢复标签', 1500);
    }
    
    // 步骤 6: 演示文件选择区域
    await showKeyHint(page, '选择备份文件', 1500);
    const fileArea = page.locator('div').filter({ hasText: /点击选择备份文件/ }).first();
    if (await fileArea.isVisible().catch(() => false)) {
      await clickWithEffect(page, fileArea, '选择文件', 1000);
      
      // 注意：实际文件上传需要真实文件路径
      // 这里只演示点击动作
      // await page.getByTestId('backup-restore-dialog').setInputFiles('path/to/backup.zip');
      await page.waitForTimeout(1500);
    }
    
    // 步骤 7: 显示完成按钮位置
    await showKeyHint(page, '确认并刷新', 1500);
    const completeBtn = page.getByRole('button', { name: /完成.*刷新/ });
    if (await completeBtn.isVisible().catch(() => false)) {
      const box = await completeBtn.boundingBox();
      if (box) {
        // 只显示位置，不实际点击（避免刷新页面）
        await showClickEffect(page, box.x + box.width / 2, box.y + box.height / 2, '完成并刷新');
        await page.waitForTimeout(1500);
      }
    }
    
    // 步骤 8: 关闭对话框
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // 最终等待
    await page.waitForTimeout(2000);
  });
});
