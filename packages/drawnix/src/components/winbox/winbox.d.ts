// WinBox.js 类型声明文件
declare module 'winbox' {
  interface WinBoxOptions {
    /** 窗口唯一标识 */
    id?: string | number;
    /** 初始 z-index */
    index?: number;
    /** 窗口标题 */
    title?: string;
    /** 标题栏图标 URL */
    icon?: string;
    /** CSS 类名 */
    class?: string | string[];
    /** 挂载 DOM 元素 */
    mount?: HTMLElement;
    /** 设置 innerHTML */
    html?: string;
    /** 加载 iframe URL */
    url?: string;
    /** 初始宽度（支持 px、%） */
    width?: number | string;
    /** 初始高度（支持 px、%） */
    height?: number | string;
    /** 最小宽度 */
    minwidth?: number | string;
    /** 最小高度 */
    minheight?: number | string;
    /** 最大宽度 */
    maxwidth?: number | string;
    /** 最大高度 */
    maxheight?: number | string;
    /** 初始位置 x（支持 "center"、"right"、px、%） */
    x?: number | string;
    /** 初始位置 y（支持 "center"、"bottom"、px、%） */
    y?: number | string;
    /** 自动适应内容大小 */
    autosize?: boolean;
    /** 限制窗口可用区域 - 顶部 */
    top?: number | string;
    /** 限制窗口可用区域 - 右侧 */
    right?: number | string;
    /** 限制窗口可用区域 - 底部 */
    bottom?: number | string;
    /** 限制窗口可用区域 - 左侧 */
    left?: number | string;
    /** 允许窗口移出视口 */
    overflow?: boolean;
    /** 创建时最大化 */
    max?: boolean;
    /** 创建时最小化 */
    min?: boolean;
    /** 创建时隐藏 */
    hidden?: boolean;
    /** 模态窗口 */
    modal?: boolean;
    /** 背景样式（支持颜色、渐变、图片） */
    background?: string;
    /** 边框宽度 */
    border?: number | string;
    /** 挂载根元素 */
    root?: HTMLElement;
    /** 窗口创建时回调 */
    oncreate?: (options: WinBoxOptions) => void;
    /** 窗口移动时回调 */
    onmove?: (x: number, y: number) => void;
    /** 窗口调整大小时回调 */
    onresize?: (width: number, height: number) => void;
    /** 进入全屏回调 */
    onfullscreen?: () => void;
    /** 最小化回调 */
    onminimize?: () => void;
    /** 最大化回调 */
    onmaximize?: () => void;
    /** 恢复窗口状态回调 */
    onrestore?: () => void;
    /** 隐藏回调 */
    onhide?: () => void;
    /** 显示回调 */
    onshow?: () => void;
    /** 关闭前回调（返回 true 阻止关闭） */
    onclose?: (force?: boolean) => boolean | void;
    /** 聚焦回调 */
    onfocus?: () => void;
    /** 失焦回调 */
    onblur?: () => void;
  }

  class WinBox {
    /** 窗口唯一标识 */
    readonly id: string | number;
    /** 窗口索引 */
    readonly index: number;
    /** 窗口 DOM 元素 */
    readonly window: HTMLElement;
    /** 窗口内容区域 */
    readonly body: HTMLElement;
    /** 是否最小化 */
    readonly min: boolean;
    /** 是否最大化 */
    readonly max: boolean;
    /** 是否全屏 */
    readonly full: boolean;
    /** 是否隐藏 */
    readonly hidden: boolean;
    /** 是否聚焦 */
    readonly focused: boolean;
    /** 窗口位置 x */
    x: number;
    /** 窗口位置 y */
    y: number;
    /** 窗口宽度 */
    width: number;
    /** 窗口高度 */
    height: number;
    /** 视口限制 - 顶部 */
    top: number;
    /** 视口限制 - 右侧 */
    right: number;
    /** 视口限制 - 底部 */
    bottom: number;
    /** 视口限制 - 左侧 */
    left: number;
    /** 最小宽度 */
    minwidth: number;
    /** 最小高度 */
    minheight: number;
    /** 最大宽度 */
    maxwidth: number;
    /** 最大高度 */
    maxheight: number;

    constructor(options?: WinBoxOptions);
    constructor(title: string, options?: WinBoxOptions);

    /** 创建新窗口 */
    static new(options?: WinBoxOptions): WinBox;
    static new(title: string, options?: WinBoxOptions): WinBox;

    /** 获取所有窗口栈（按焦点顺序） */
    static stack(): WinBox[];

    /** 挂载 DOM 元素到窗口 */
    mount(src: HTMLElement): this;
    /** 卸载内容 */
    unmount(dest?: HTMLElement): this;
    /** 设置 iframe URL */
    setUrl(url: string): this;
    /** 设置标题 */
    setTitle(title: string): this;
    /** 设置图标 */
    setIcon(url: string): this;
    /** 移动窗口位置 */
    move(x?: number | string, y?: number | string): this;
    /** 调整窗口大小 */
    resize(width?: number | string, height?: number | string): this;
    /** 关闭窗口 */
    close(force?: boolean): boolean;
    /** 聚焦窗口 */
    focus(state?: boolean): this;
    /** 失焦窗口 */
    blur(state?: boolean): this;
    /** 隐藏窗口 */
    hide(state?: boolean): this;
    /** 显示窗口 */
    show(state?: boolean): this;
    /** 最小化窗口 */
    minimize(state?: boolean): this;
    /** 最大化窗口 */
    maximize(state?: boolean): this;
    /** 全屏窗口 */
    fullscreen(state?: boolean): this;
    /** 恢复窗口状态 */
    restore(): this;
    /** 设置背景 */
    setBackground(background: string): this;
    /** 添加 CSS 类 */
    addClass(name: string): this;
    /** 移除 CSS 类 */
    removeClass(name: string): this;
    /** 检查是否有 CSS 类 */
    hasClass(name: string): boolean;
    /** 切换 CSS 类 */
    toggleClass(name: string): this;
    /** 添加控制按钮 */
    addControl(options: { index?: number; class: string; image?: string; click?: (event: Event) => void }): this;
    /** 移除控制按钮 */
    removeControl(name: string): this;
  }

  export default WinBox;
}
