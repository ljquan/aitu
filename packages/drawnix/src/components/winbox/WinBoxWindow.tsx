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
}) => {
  const winboxRef = useRef<any>(null);
  const winboxElementRef = useRef<HTMLDivElement | null>(null); // WinBox 窗口的 DOM 元素
  const [headerPortalContainer, setHeaderPortalContainer] = useState<HTMLElement | null>(null);
  const [bodyPortalContainer, setBodyPortalContainer] = useState<HTMLElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [winboxLoaded, setWinboxLoaded] = useState(!!WinBoxConstructor);

  // 应用 viewport scale 以确保缩放时窗口位置和大小不变
  // 注意：WinBox 使用 fixed 定位，所以不需要 enablePositionTracking
  const refreshViewportScale = useViewportScale(winboxElementRef, {
    enablePositionTracking: false, // WinBox 使用 fixed 定位
    enableScaleCompensation: true, // 启用反向缩放保持大小不变
  });

  // 加载 WinBox
  useEffect(() => {
    if (!winboxLoaded) {
      loadWinBox().then(() => setWinboxLoaded(true));
    }
  }, [winboxLoaded]);

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
        class: classList,
        root: container || document.body,
        onclose: handleClose,
        onmaximize: onMaximize,
        onrestore: onRestore,
        onfocus: onFocus,
        onblur: onBlur,
        onmove: onMove,
        onresize: onResize,
      });

      winboxRef.current = wb;

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
