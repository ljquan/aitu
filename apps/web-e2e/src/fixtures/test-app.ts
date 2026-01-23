/**
 * DrawnixApp Page Object
 * 封装应用的核心页面对象，提供统一的测试接口
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class DrawnixApp {
  readonly page: Page;
  
  // 主要容器
  readonly container: Locator;
  readonly canvas: Locator;
  
  // 工具栏
  readonly toolbar: {
    container: Locator;
    hand: Locator;
    select: Locator;
    pencil: Locator;
    pen: Locator;
    eraser: Locator;
    shape: Locator;
    text: Locator;
    mindmap: Locator;
    project: Locator;
    toolbox: Locator;
    mediaLibrary: Locator;
    settings: Locator;
  };
  
  // AI 输入栏
  readonly aiInputBar: {
    container: Locator;
    textarea: Locator;
    sendBtn: Locator;
    modelSelector: Locator;
    sizeSelector: Locator;
    historyBtn: Locator;
  };
  
  // 视图导航
  readonly viewNavigation: {
    container: Locator;
    zoomIn: Locator;
    zoomOut: Locator;
    zoomDisplay: Locator;
    minimap: Locator;
  };
  
  // 对话框和抽屉
  readonly dialogs: {
    settings: Locator;
    projectDrawer: Locator;
    toolboxDrawer: Locator;
    mediaLibrary: Locator;
    backupRestore: Locator;
  };
  
  // 弹出工具栏
  readonly popupToolbar: Locator;
  
  // 灵感创意板
  readonly inspirationBoard: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // 主容器
    this.container = page.locator('.drawnix');
    this.canvas = page.locator('.board-host-svg');
    
    // 工具栏
    this.toolbar = {
      container: page.locator('[data-testid="unified-toolbar"]'),
      hand: page.locator('[data-testid="toolbar-hand"]'),
      select: page.locator('[data-testid="toolbar-select"]'),
      pencil: page.locator('[data-testid="toolbar-pencil"]'),
      pen: page.locator('[data-testid="toolbar-pen"]'),
      eraser: page.locator('[data-testid="toolbar-eraser"]'),
      shape: page.locator('[data-testid="toolbar-shape"]'),
      text: page.locator('[data-testid="toolbar-text"]'),
      mindmap: page.locator('[data-testid="toolbar-mindmap"]'),
      project: page.locator('[data-testid="toolbar-project"]'),
      toolbox: page.locator('[data-testid="toolbar-toolbox"]'),
      mediaLibrary: page.locator('[data-testid="toolbar-media-library"]'),
      settings: page.locator('[data-testid="toolbar-settings"]'),
    };
    
    // AI 输入栏
    this.aiInputBar = {
      container: page.locator('[data-testid="ai-input-bar"]'),
      textarea: page.locator('[data-testid="ai-input-textarea"]'),
      sendBtn: page.locator('[data-testid="ai-send-btn"]'),
      modelSelector: page.locator('[data-testid="model-selector"]'),
      sizeSelector: page.locator('[data-testid="size-selector"]'),
      historyBtn: page.locator('[data-testid="prompt-history-btn"]'),
    };
    
    // 视图导航
    this.viewNavigation = {
      container: page.locator('[data-testid="view-navigation"]'),
      zoomIn: page.locator('[data-testid="zoom-in"]'),
      zoomOut: page.locator('[data-testid="zoom-out"]'),
      zoomDisplay: page.locator('[data-testid="zoom-display"]'),
      minimap: page.locator('[data-testid="minimap"]'),
    };
    
    // 对话框
    this.dialogs = {
      settings: page.locator('[data-testid="settings-dialog"]'),
      projectDrawer: page.locator('[data-testid="project-drawer"]'),
      toolboxDrawer: page.locator('[data-testid="toolbox-drawer"]'),
      mediaLibrary: page.locator('[data-testid="media-library-modal"]'),
      backupRestore: page.locator('[data-testid="backup-restore-dialog"]'),
    };
    
    // 弹出工具栏
    this.popupToolbar = page.locator('[data-testid="popup-toolbar"]');
    
    // 灵感创意板
    this.inspirationBoard = page.locator('[data-testid="inspiration-board"]');
  }

  /**
   * 导航到应用首页并等待加载完成
   */
  async goto() {
    await this.page.goto('/');
    await this.waitForReady();
  }

  /**
   * 等待应用加载完成
   */
  async waitForReady() {
    await this.container.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * 获取画布边界框
   */
  async getCanvasBoundingBox() {
    return await this.canvas.boundingBox();
  }

  /**
   * 在画布上指定位置点击
   */
  async clickOnCanvas(offsetX: number, offsetY: number) {
    const box = await this.getCanvasBoundingBox();
    if (box) {
      await this.page.mouse.click(box.x + offsetX, box.y + offsetY);
    }
  }

  /**
   * 在画布上绘制线条
   */
  async drawLine(startX: number, startY: number, endX: number, endY: number) {
    const box = await this.getCanvasBoundingBox();
    if (box) {
      await this.page.mouse.move(box.x + startX, box.y + startY);
      await this.page.mouse.down();
      await this.page.mouse.move(box.x + endX, box.y + endY);
      await this.page.mouse.up();
    }
  }

  /**
   * 选择工具
   */
  async selectTool(tool: keyof typeof this.toolbar) {
    const toolBtn = this.toolbar[tool];
    if (toolBtn && 'click' in toolBtn) {
      await (toolBtn as Locator).click();
    }
  }

  /**
   * 打开设置对话框
   */
  async openSettings() {
    await this.toolbar.settings.click();
    await expect(this.dialogs.settings).toBeVisible();
  }

  /**
   * 关闭设置对话框
   */
  async closeSettings() {
    const closeBtn = this.dialogs.settings.locator('[data-testid="dialog-close"]');
    await closeBtn.click();
    await expect(this.dialogs.settings).not.toBeVisible();
  }

  /**
   * 打开项目抽屉
   */
  async openProjectDrawer() {
    await this.toolbar.project.click();
    await expect(this.dialogs.projectDrawer).toBeVisible();
  }

  /**
   * 打开工具箱抽屉
   */
  async openToolboxDrawer() {
    await this.toolbar.toolbox.click();
    await expect(this.dialogs.toolboxDrawer).toBeVisible();
  }

  /**
   * 打开素材库
   */
  async openMediaLibrary() {
    if (await this.toolbar.mediaLibrary.isVisible()) {
      await this.toolbar.mediaLibrary.click();
      await expect(this.dialogs.mediaLibrary).toBeVisible();
    }
  }

  /**
   * 在 AI 输入框中输入提示词
   */
  async inputPrompt(prompt: string) {
    await this.aiInputBar.textarea.fill(prompt);
  }

  /**
   * 获取 AI 输入框的值
   */
  async getPromptValue() {
    return await this.aiInputBar.textarea.inputValue();
  }

  /**
   * 截图辅助方法
   */
  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png` });
  }
}
