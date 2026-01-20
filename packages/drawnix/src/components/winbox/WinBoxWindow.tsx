import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import 'winbox/dist/css/winbox.min.css';
import './winbox-custom.scss';
import { useViewportScale } from '../../hooks/useViewportScale';

// 全局存储 WinBox 构造函数
let WinBoxConstructor: any = null;
let loadingPromise: Promise<any> | null = null;

// 动态加载 WinBox - 使用 Vite 动态导入
const loadWinBox = async (): Promise<any> => {
  if (WinBoxConstructor) return WinBoxConstructor;
  
  if (typeof window !== 'undefined' && (window as any).WinBox) {
    WinBoxConstructor = (window as any).WinBox;
    return WinBoxConstructor;
  }
  
  if (loadingPromise) return loadingPromise;
  
  // 使用动态导入，Vite 会正确处理这个 bundle
  loadingPromise = (async () => {
    try {
      // 动态导入 winbox bundle，Vite 会将其作为外部资源处理
      // @ts-ignore
      await import('winbox/dist/winbox.bundle.min.js');
      WinBoxConstructor = (window as any).WinBox;
      if (WinBoxConstructor) {
        return WinBoxConstructor;
      }
      throw new Error('WinBox not found after import');
    } catch (error) {
      console.warn('Dynamic import failed, falling back to CDN:', error);
      // Fallback: 使用 CDN
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/winbox@0.2.82/dist/winbox.bundle.min.js';
        script.async = true;
        script.onload = () => {
          WinBoxConstructor = (window as any).WinBox;
          if (WinBoxConstructor) {
            resolve(WinBoxConstructor);
          } else {
            reject(new Error('WinBox not found after CDN loading'));
          }
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
  })();
  
  return loadingPromise;
};

export interface WinBoxWindowProps {
  /** 窗口是否可见 */
  visible: boolean;
  /** 窗口标题 */
  title: string;
  /** 窗口关闭回调 */
  onClose?: () => void;
  /** 子组件 */
  children: React.ReactNode;
  /** 窗口宽度，支持数字(px)或字符串(如 '80%') */
  width?: number | string;
  /** 窗口高度，支持数字(px)或字符串(如 '80%') */
  height?: number | string;
  /** 最小宽度 */
  minWidth?: number;
  /** 最小高度 */
  minHeight?: number;
  /** 窗口初始位置 x，支持 'center'、'right'、数字 */
  x?: number | string;
  /** 窗口初始位置 y，支持 'center'、'bottom'、数字 */
  y?: number | string;
  /** 是否可最大化 */
  maximizable?: boolean;
  /** 是否可最小化 */
  minimizable?: boolean;
  /** 是否可调整大小 */
  resizable?: boolean;
  /** 是否可移动 */
  movable?: boolean;
  /** 是否模态窗口 */
  modal?: boolean;
  /** 背景色 */
  background?: string;
  /** 边框宽度 */
  border?: number;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 窗口 ID */
  id?: string;
  /** 标题栏自定义内容（使用 React.Portal 渲染） */
  headerContent?: React.ReactNode;
  /** 挂载容器 */
  container?: HTMLElement | null;
  /** 窗口最大化回调 */
  onMaximize?: () => void;
  /** 窗口恢复回调 */
  onRestore?: () => void;
  /** 窗口聚焦回调 */
  onFocus?: () => void;
  /** 窗口失焦回调 */
  onBlur?: () => void;
  /** 窗口移动回调 */
  onMove?: (x: number, y: number) => void;
  /** 窗口调整大小回调 */
  onResize?: (width: number, height: number) => void;
  /** 是否自动最大化 */
  autoMaximize?: boolean;
  /** 允许窗口移出视口时，至少保留在屏幕内的像素数（默认 50） */
  minVisiblePixels?: number;
}

/**
 * WinBox 窗口 React 封装组件
 * 提供可拖拽、可调整大小、可最小化/最大化的浮动窗口体验
 * 
 * 重要：使用 React Portal 渲染内容到 WinBox 的 .wb-body 中，
 * 而不是使用 WinBox 的 mount 选项，以保持 React 事件系统正常工作。
 */
export const WinBoxWindow: React.FC<WinBoxWindowProps> = ({
  visible,
  title,
  onClose,
  children,
  width = '80%',
  height = '80%',
  minWidth = 400,
  minHeight = 300,
  x = 'center',
  y = 'center',
  maximizable = true,
  minimizable = true,
  resizable = true,
  movable = true,
  modal = false,
  background = 'linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%)',
  border = 0,
  className,
  id,
  headerContent,
  container,
  onMaximize,
  onRestore,
  onFocus,
  onBlur,
  onMove,
  onResize,
  autoMaximize = false,
  minVisiblePixels = 50,
}) => {
  const winboxRef = useRef<any>(null);
  const winboxElementRef = useRef<HTMLDivElement | null>(null); // WinBox 窗口的 DOM 元素
  const [headerPortalContainer, setHeaderPortalContainer] = useState<HTMLElement | null>(null);
  const [bodyPortalContainer, setBodyPortalContainer] = useState<HTMLElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [winboxLoaded, setWinboxLoaded] = useState(!!WinBoxConstructor);

  // 跟踪分屏状态 (使用 state 以便触发 hook 重新计算)
  const [splitSide, _setSplitSide] = useState<'left' | 'right' | null>(null);
  const splitSideRef = useRef<'left' | 'right' | null>(null);
  // 保存原始 minWidth 以便分屏后恢复
  const originalMinWidthRef = useRef<number | null>(null);
  
  const setSplitSide = useCallback((side: 'left' | 'right' | null) => {
    _setSplitSide(side);
    splitSideRef.current = side;
    
    // 退出分屏时恢复原始 minWidth
    if (side === null && originalMinWidthRef.current !== null && winboxRef.current) {
      winboxRef.current.minwidth = originalMinWidthRef.current;
      originalMinWidthRef.current = null;
    }
  }, []);

  // 静态跟踪全局分屏占用情况
  const getOccupiedSides = useCallback(() => {
    const sides = { left: false, right: false };
    if (typeof window === 'undefined' || !(window as any).WinBox) return sides;

    // 直接从 WinBox 栈中获取实例，避免受 CSS transform 影响
    const WinBox = (window as any).WinBox;
    const allBoxes = WinBox.stack();
    const viewportWidth = window.innerWidth;

    allBoxes.forEach((wb: any) => {
      // 忽略当前正在操作的窗口
      if (wb === winboxRef.current) return;

      const isHalfWidth = Math.abs(wb.width - viewportWidth / 2) < 20;
      if (isHalfWidth) {
        if (wb.x < 20) sides.left = true;
        if (Math.abs((wb.x + wb.width) - viewportWidth) < 20) sides.right = true;
      }
    });
    return sides;
  }, []);

  const handleSplit = useCallback(() => {
    const wb = winboxRef.current;
    // 安全检查：确保 WinBox 实例和其 DOM 元素都存在
    if (!wb || !wb.window) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const occupied = getOccupiedSides();

    let targetSide: 'left' | 'right';

    // 逻辑：如果已经分屏，切换到另一边
    if (splitSide === 'left') targetSide = 'right';
    else if (splitSide === 'right') targetSide = 'left';
    else {
      // 第一次分屏逻辑
      const centerX = wb.x + wb.width / 2;
      const screenMid = viewportWidth / 2;

      if (occupied.left && !occupied.right) {
        targetSide = 'right';
      } else if (!occupied.left && occupied.right) {
        targetSide = 'left';
      } else {
        // 根据位置判断：靠近哪边去哪边，中间默认去右边
        if (centerX < screenMid) {
          targetSide = 'left';
        } else {
          targetSide = 'right';
        }
      }
    }

    // 保存原始 minWidth，并临时设置为较小的值以允许半屏
    if (originalMinWidthRef.current === null) {
      originalMinWidthRef.current = wb.minwidth;
    }
    
    const halfWidth = Math.floor(viewportWidth / 2);
    
    // 分屏时强制设置 minwidth 为一个足够小的值，确保可以缩小到半屏
    wb.minwidth = Math.min(200, halfWidth);

    // 执行分屏：先重置最大化状态
    if (wb.max) {
      wb.restore();
      // restore 后需要等待一帧让 WinBox 完成状态更新
      requestAnimationFrame(() => {
        if (!wb || !wb.window) return;
        performSplit(wb, targetSide, halfWidth, viewportWidth, viewportHeight);
      });
    } else {
      performSplit(wb, targetSide, halfWidth, viewportWidth, viewportHeight);
    }
  }, [getOccupiedSides, splitSide, setSplitSide]);

  // 执行实际的分屏操作
  const performSplit = useCallback((wb: any, targetSide: 'left' | 'right', halfWidth: number, viewportWidth: number, viewportHeight: number) => {
    if (!wb || !wb.window) return;
    
    // 关键：分屏前必须重置边界，否则 resize 会加上负边界的宽度
    wb.left = 0;
    wb.right = 0;
    wb.top = 0;
    wb.bottom = 0;

    if (targetSide === 'left') {
      wb.resize(halfWidth, viewportHeight).move(0, 0);
      setSplitSide('left');
    } else {
      // 使用 viewportWidth - halfWidth 确保精准靠右
      wb.resize(halfWidth, viewportHeight).move(viewportWidth - halfWidth, 0);
      setSplitSide('right');
    }
  }, [setSplitSide]);

  // 应用 viewport scale 以确保缩放时窗口位置和大小不变
  // 注意：分屏或最大化时禁用缩放补偿，防止超出屏幕
  const refreshViewportScale = useViewportScale(winboxElementRef, {
    enablePositionTracking: false,
    enableScaleCompensation: !splitSide && !winboxRef.current?.max,
  });

  // 加载 WinBox
  useEffect(() => {
    if (!winboxLoaded) {
      loadWinBox().then(() => setWinboxLoaded(true));
    }
  }, [winboxLoaded]);

  const isMovingRef = useRef(false);
  
  // 处理窗口关闭
  const handleClose = useCallback(() => {
    onClose?.();
    return false; // 返回 false 让 WinBox 不自动销毁，由 React 控制
  }, [onClose]);

  // 创建或更新窗口
  useEffect(() => {
    if (!winboxLoaded || !WinBoxConstructor) return;
    
    // 当 visible 变为 false 时，关闭并清理窗口
    if (!visible) {
      if (winboxRef.current) {
        try {
          winboxRef.current.close(true); // force close
        } catch {
          // 忽略关闭错误
        }
        winboxRef.current = null;
        winboxElementRef.current = null; // 清空 DOM 元素引用
        setHeaderPortalContainer(null);
        setBodyPortalContainer(null);
        setIsReady(false);
      }
      return;
    }
    
    // 当 visible 变为 true 且窗口不存在时，创建窗口
    if (visible && !winboxRef.current) {
      // 构建 class 列表
      const classList: string[] = ['winbox-react'];
      if (!maximizable) classList.push('no-max');
      if (!minimizable) classList.push('no-min');
      if (!resizable) classList.push('no-resize');
      if (!movable) classList.push('no-move');
      // 隐藏全屏按钮,因为全屏功能可能导致用户体验问题
      classList.push('no-full');
      if (className) classList.push(className);

      // 创建 WinBox 实例 - 不使用 mount 选项，改用 Portal
      const wb = new WinBoxConstructor({
        id,
        title,
        // 不使用 mount，改用 React Portal 渲染内容
        width,
        height,
        minwidth: minWidth,
        minheight: minHeight,
        x,
        y,
        modal,
        background,
        border,
        overflow: true, // 允许内容移出视口
        class: classList,
        root: container || document.body,
        onclose: handleClose,
        onmaximize: onMaximize,
        onrestore: onRestore,
        onfocus: onFocus,
        onblur: onBlur,
        onmove: function (this: any, x: number, y: number) {
          if (this.max || this.min || isMovingRef.current) return;

          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const wbWidth = this.width;
          const wbHeight = this.height;
          const minVisible = minVisiblePixels;

          // 如果是手动移动（不是由 handleSplit 触发的移动），且位移较大，则退出分屏状态
          if (splitSideRef.current) {
            const expectedX = splitSideRef.current === 'left' ? 0 : viewportWidth - wbWidth;
            if (Math.abs(x - expectedX) > 50) {
              setSplitSide(null);
            }
          }

          let newX = x;
          let newY = y;

          // X 轴约束：左侧至少留 50px，右侧至少留 50px
          if (x < minVisible - wbWidth) newX = minVisible - wbWidth;
          if (x > viewportWidth - minVisible) newX = viewportWidth - minVisible;

          // Y 轴约束：顶部不能出 (确保标题栏可见)，底部至少留 50px
          if (y < 0) newY = 0;
          if (y > viewportHeight - minVisible) newY = viewportHeight - minVisible;

          if (newX !== x || newY !== y) {
            isMovingRef.current = true;
            this.move(newX, newY);
            isMovingRef.current = false;
          }

          onMove?.(newX, newY);
        },
        onresize: onResize,
      });

      winboxRef.current = wb;

      // 添加分屏按钮
      wb.addControl({
        index: 0, // 在最大化按钮左边（WinBox 默认按钮索引从右往左是 0:close, 1:full, 2:max, 3:min）
        // 但 WinBox 的 addControl 是往左添加，所以 index 影响排序
        class: 'wb-split',
        image: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGxpbmUgeDE9IjEyIiB5MT0iMyIgeDI9IjEyIiB5Mj0iMjEiPjwvbGluZT48L3N2Zz4=',
        click: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          handleSplit();
        }
      });

      // 保存 WinBox 窗口的 DOM 元素引用，用于应用 viewport scale
      if (wb.window) {
        winboxElementRef.current = wb.window as HTMLDivElement;
        // 立即触发一次缩放计算，确保弹窗首次显示时就应用正确的缩放
        requestAnimationFrame(() => {
          refreshViewportScale();
        });
        
        // 获取 .wb-body 元素作为内容的 Portal 容器
        const wbBody = wb.window.querySelector('.wb-body');
        if (wbBody) {
          setBodyPortalContainer(wbBody as HTMLElement);
        }
      }

      // 如果有自定义标题栏内容，创建 portal 容器
      if (headerContent && wb.window) {
        const drag = wb.window.querySelector('.wb-drag');
        if (drag) {
          // 创建一个容器用于渲染自定义标题栏内容（如模型选择器）
          const portalContainer = document.createElement('div');
          portalContainer.className = 'wb-header-custom';
          
          // 插入到拖拽区域末尾（标题后面）
          drag.appendChild(portalContainer);
          setHeaderPortalContainer(portalContainer);
        }
      }

      setIsReady(true);

      // 如果设置了自动最大化，则在创建后最大化窗口
      if (autoMaximize) {
        // 使用 setTimeout 确保窗口完全创建后再最大化
        setTimeout(() => {
          if (winboxRef.current) {
            setStrictBoundaries();
            winboxRef.current.maximize();
          }
        }, 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, winboxLoaded, autoMaximize]);
  // 注意: handleClose 不在依赖中，因为它只在创建时使用一次，
  // 添加到依赖会导致 WinBox 实例频繁重建并触发关闭回调
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (winboxRef.current) {
        try {
          // 防止在卸载时触发 onclose 回调
          winboxRef.current.onclose = null;
          winboxRef.current.close(true);
        } catch {
          // 忽略
        }
        winboxRef.current = null;
        winboxElementRef.current = null; // 清空 DOM 元素引用
      }
    };
  }, []);

  // 更新标题
  useEffect(() => {
    if (winboxRef.current && title) {
      winboxRef.current.setTitle(title);
    }
  }, [title]);

  // 控制显示/隐藏
  useEffect(() => {
    if (winboxRef.current) {
      if (visible) {
        winboxRef.current.show();
        winboxRef.current.focus();
      } else {
        winboxRef.current.hide();
      }
    }
  }, [visible]);

  // 监听 autoMaximize 变化，动态最大化窗口
  useEffect(() => {
    if (winboxRef.current && autoMaximize) {
      winboxRef.current.maximize();
    }
  }, [autoMaximize]);

  // 使用 Portal 渲染内容到 WinBox 的 .wb-body 中
  // 这样可以保持 React 事件系统正常工作
  return (
    <>
      {/* 内容通过 Portal 渲染到 WinBox 的 .wb-body */}
      {isReady && bodyPortalContainer && createPortal(
        <div className="winbox-content-wrapper">
          {children}
        </div>,
        bodyPortalContainer
      )}
      {/* 自定义标题栏内容通过 Portal 渲染 */}
      {isReady && headerContent && headerPortalContainer && 
        createPortal(headerContent, headerPortalContainer)
      }
    </>
  );
};

export default WinBoxWindow;
