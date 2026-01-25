/**
 * useDeviceType Hook
 * 
 * 检测当前设备类型（移动端、平板、桌面端）
 * 响应窗口大小变化实时更新
 */

import { useState, useEffect, useCallback } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  /** 设备类型 */
  type: DeviceType;
  /** 是否为移动端 (包括平板) */
  isMobile: boolean;
  /** 是否为平板 */
  isTablet: boolean;
  /** 是否为桌面端 */
  isDesktop: boolean;
  /** 是否为触控设备 */
  isTouchDevice: boolean;
  /** 是否为竖屏 */
  isPortrait: boolean;
  /** 是否为横屏 */
  isLandscape: boolean;
  /** 视口宽度 */
  viewportWidth: number;
  /** 视口高度 */
  viewportHeight: number;
}

// 断点定义（与 _responsive.scss 保持一致）
const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  tabletLandscape: 1024,
} as const;

/**
 * 检测是否为触控设备
 */
function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is IE-specific
    navigator.msMaxTouchPoints > 0
  );
}

/**
 * 根据视口宽度获取设备类型
 */
function getDeviceType(width: number): DeviceType {
  if (width <= BREAKPOINTS.mobile) {
    return 'mobile';
  }
  if (width <= BREAKPOINTS.tabletLandscape) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * 获取完整的设备信息
 */
function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    // SSR 默认值
    return {
      type: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isTouchDevice: false,
      isPortrait: false,
      isLandscape: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const type = getDeviceType(width);
  const isTouchDevice = detectTouchDevice();
  const isPortrait = height > width;

  return {
    type,
    isMobile: type === 'mobile' || type === 'tablet',
    isTablet: type === 'tablet',
    isDesktop: type === 'desktop',
    isTouchDevice,
    isPortrait,
    isLandscape: !isPortrait,
    viewportWidth: width,
    viewportHeight: height,
  };
}

/**
 * useDeviceType Hook
 * 
 * @example
 * ```tsx
 * const { type, isMobile, isPortrait } = useDeviceType();
 * 
 * if (isMobile) {
 *   return <MobileLayout />;
 * }
 * return <DesktopLayout />;
 * ```
 */
export function useDeviceType(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo);

  const updateDeviceInfo = useCallback(() => {
    setDeviceInfo(getDeviceInfo());
  }, []);

  useEffect(() => {
    // 初始化时更新（处理 SSR hydration）
    updateDeviceInfo();

    // 监听窗口大小变化
    window.addEventListener('resize', updateDeviceInfo);
    
    // 监听屏幕方向变化
    window.addEventListener('orientationchange', updateDeviceInfo);

    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
      window.removeEventListener('orientationchange', updateDeviceInfo);
    };
  }, [updateDeviceInfo]);

  return deviceInfo;
}

/**
 * 简化版 hook，仅返回设备类型
 */
export function useDeviceTypeSimple(): DeviceType {
  const { type } = useDeviceType();
  return type;
}

/**
 * 检测是否为移动端（包括平板）
 */
export function useIsMobile(): boolean {
  const { isMobile } = useDeviceType();
  return isMobile;
}

/**
 * 检测是否为触控设备
 */
export function useIsTouchDevice(): boolean {
  const { isTouchDevice } = useDeviceType();
  return isTouchDevice;
}

/**
 * 检测屏幕方向
 */
export function useOrientation(): 'portrait' | 'landscape' {
  const { isPortrait } = useDeviceType();
  return isPortrait ? 'portrait' : 'landscape';
}

export default useDeviceType;
