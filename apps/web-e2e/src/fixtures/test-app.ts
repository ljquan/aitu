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
  
  // 聊天抽屉
  readonly chatDrawer: {
    container: Locator;
    trigger: Locator;
    header: Locator;
    messageList: Locator;
    input: Locator;
    sessionList: Locator;
  };
  
  // 任务队列面板
  readonly taskQueue: {
    panel: Locator;
    tabs: Locator;
    list: Locator;
    searchInput: Locator;
    typeFilters: Locator;
  };
  
  // 素材库网格
  readonly mediaLibraryGrid: Locator;
  
  // 图片编辑器
  readonly imageEditor: Locator;
  
  // 弹出工具栏
  readonly popupToolbar: Locator;
  
  // 灵感创意板
  readonly inspirationBoard: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // 主容器
    this.container = page.locator('.drawnix');
    this.canvas = page.locator('.board-host-svg');
    
    // 工具栏（使用 CSS 类定位，因为工具按钮没有 data-testid）
    const toolbarContainer = page.locator('.unified-toolbar');
    this.toolbar = {
      container: toolbarContainer,
      // 工具按钮使用 data-track 或 aria-label 定位
      hand: toolbarContainer.locator('[data-track="toolbar_click_hand"]'),
      select: toolbarContainer.locator('[data-track="toolbar_click_selection"]'),
      pencil: toolbarContainer.locator('[data-track="toolbar_click_freehand"]'),
      pen: toolbarContainer.locator('[data-track="toolbar_click_pen"]'),
      eraser: toolbarContainer.locator('[data-track="toolbar_click_eraser"]'),
      shape: toolbarContainer.locator('[data-track="toolbar_click_geometry"]'),
      text: toolbarContainer.locator('[data-track="toolbar_click_text"]'),
      mindmap: toolbarContainer.locator('[data-track="toolbar_click_mind"]'),
      // 底部按钮使用 data-testid 或 data-track
      project: page.locator('[data-testid="toolbar-project"]'),
      toolbox: page.locator('[data-testid="toolbar-toolbox"]'),
      mediaLibrary: page.locator('[data-track="quick_toolbar_click_media_library"]'),
      settings: page.locator('[data-track="app_menu_item_settings"]'),
    };
    
    // AI 输入栏
    const aiInputBarContainer = page.locator('[data-testid="ai-input-bar"]');
    this.aiInputBar = {
      container: aiInputBarContainer,
      textarea: page.locator('[data-testid="ai-input-textarea"]'),
      sendBtn: page.locator('[data-testid="ai-send-btn"]'),
      // 模型和尺寸选择器使用 CSS 类定位
      modelSelector: aiInputBarContainer.locator('.model-dropdown-trigger'),
      sizeSelector: aiInputBarContainer.locator('.size-selector'),
      historyBtn: aiInputBarContainer.locator('.prompt-history-btn'),
    };
    
    // 视图导航
    const viewNavContainer = page.locator('[data-testid="view-navigation"]');
    this.viewNavigation = {
      container: viewNavContainer,
      zoomIn: page.locator('[data-testid="zoom-in"]'),
      zoomOut: page.locator('[data-testid="zoom-out"]'),
      zoomDisplay: page.locator('[data-testid="zoom-display"]'),
      minimap: viewNavContainer.locator('.view-navigation__minimap'),
    };
    
    // 对话框
    this.dialogs = {
      settings: page.locator('[data-testid="settings-dialog"]'),
      projectDrawer: page.locator('[data-testid="project-drawer"]'),
      toolboxDrawer: page.locator('[data-testid="toolbox-drawer"]'),
      mediaLibrary: page.locator('[data-testid="media-library-modal"]'),
      backupRestore: page.locator('[data-testid="backup-restore-dialog"]'),
    };
    
    // 聊天抽屉
    this.chatDrawer = {
      container: page.locator('[data-testid="chat-drawer"]'),
      trigger: page.locator('.chat-drawer-trigger'),
      header: page.locator('.chat-drawer__header'),
      messageList: page.locator('.chat-drawer__content'),
      input: page.locator('.chat-drawer__input'),
      sessionList: page.locator('.session-list'),
    };
    
    // 任务队列面板
    this.taskQueue = {
      panel: page.locator('[data-testid="task-queue-panel"]'),
      tabs: page.locator('.task-queue-panel .t-tabs'),
      list: page.locator('.task-queue-panel__list'),
      searchInput: page.locator('.task-queue-panel__search-input'),
      typeFilters: page.locator('.task-queue-panel__type-filters'),
    };
    
    // 素材库网格
    this.mediaLibraryGrid = page.locator('[data-testid="media-library-grid"]');
    
    // 图片编辑器
    this.imageEditor = page.locator('[data-testid="image-editor"]');
    
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

  /**
   * 打开聊天抽屉
   */
  async openChatDrawer() {
    await this.chatDrawer.trigger.click();
    await expect(this.chatDrawer.container).toHaveClass(/chat-drawer--open/);
  }

  /**
   * 关闭聊天抽屉
   */
  async closeChatDrawer() {
    const closeBtn = this.chatDrawer.container.locator('.chat-drawer__close-btn').first();
    await closeBtn.click();
    await expect(this.chatDrawer.container).not.toHaveClass(/chat-drawer--open/);
  }

  /**
   * 打开任务队列面板
   */
  async openTaskQueue() {
    // 任务队列通常在工具栏底部
    const taskQueueBtn = this.page.locator('[data-testid="toolbar-task-queue"]');
    if (await taskQueueBtn.isVisible()) {
      await taskQueueBtn.click();
      await expect(this.taskQueue.panel).toBeVisible();
    }
  }

  /**
   * 关闭任务队列面板
   */
  async closeTaskQueue() {
    const closeBtn = this.taskQueue.panel.locator('.side-drawer__close-btn');
    await closeBtn.click();
    await expect(this.taskQueue.panel).not.toBeVisible();
  }

  /**
   * 切换任务队列标签页
   */
  async switchTaskQueueTab(tab: 'all' | 'active' | 'completed' | 'failed') {
    const tabMap = {
      all: '全部',
      active: '生成中',
      completed: '已完成',
      failed: '失败',
    };
    const tabItem = this.taskQueue.tabs.locator(`.t-tabs__nav-item:has-text("${tabMap[tab]}")`);
    await tabItem.click();
  }

  /**
   * 打开备份恢复对话框
   */
  async openBackupRestore() {
    // 通常在设置菜单中
    const settingsMenu = this.page.locator('.settings-dialog');
    if (await settingsMenu.isVisible()) {
      const backupBtn = settingsMenu.locator('button:has-text("备份")');
      if (await backupBtn.isVisible()) {
        await backupBtn.click();
      }
    }
  }

  /**
   * 关闭对话框（通用方法）
   */
  async closeDialog(dialog: Locator) {
    const closeBtn = dialog.locator('[data-testid="dialog-close"], .t-dialog__close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  }

  /**
   * 触发元素的悬停状态
   */
  async triggerHoverState(locator: Locator) {
    await locator.hover();
    // 等待悬停效果生效
    await this.page.waitForTimeout(100);
  }

  /**
   * 等待动画完成
   */
  async waitForAnimation(duration = 300) {
    await this.page.waitForTimeout(duration);
  }

  /**
   * 等待组件稳定（无动画、无加载）
   */
  async waitForStable(timeout = 2000) {
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(timeout);
  }

  /**
   * 缩放画布
   */
  async zoomCanvas(level: 'in' | 'out' | number) {
    if (level === 'in') {
      await this.viewNavigation.zoomIn.click();
    } else if (level === 'out') {
      await this.viewNavigation.zoomOut.click();
    } else {
      // 点击缩放显示，输入具体数值
      await this.viewNavigation.zoomDisplay.click();
      // 假设有输入框
      const zoomInput = this.page.locator('.zoom-input');
      if (await zoomInput.isVisible()) {
        await zoomInput.fill(String(level));
        await zoomInput.press('Enter');
      }
    }
  }

  /**
   * 在画布上绘制形状
   */
  async drawShape(type: 'rect' | 'ellipse' | 'line', x: number, y: number, width: number, height: number) {
    // 先选择形状工具
    await this.selectTool('shape');
    await this.page.waitForTimeout(100);
    
    const box = await this.getCanvasBoundingBox();
    if (box) {
      await this.page.mouse.move(box.x + x, box.y + y);
      await this.page.mouse.down();
      await this.page.mouse.move(box.x + x + width, box.y + y + height);
      await this.page.mouse.up();
    }
  }

  /**
   * 获取当前缩放比例
   */
  async getCurrentZoom(): Promise<string> {
    return await this.viewNavigation.zoomDisplay.innerText();
  }

  /**
   * 检查组件是否可见
   */
  async isComponentVisible(component: 'chatDrawer' | 'taskQueue' | 'projectDrawer' | 'toolboxDrawer' | 'mediaLibrary'): Promise<boolean> {
    const componentMap = {
      chatDrawer: this.chatDrawer.container,
      taskQueue: this.taskQueue.panel,
      projectDrawer: this.dialogs.projectDrawer,
      toolboxDrawer: this.dialogs.toolboxDrawer,
      mediaLibrary: this.dialogs.mediaLibrary,
    };
    return await componentMap[component].isVisible();
  }
}
