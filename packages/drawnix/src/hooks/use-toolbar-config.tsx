/**
 * 工具栏配置 Context 和 Hook
 * 提供工具栏按钮顺序和显示状态的管理
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  ToolbarConfig,
  ToolbarButtonConfig,
  getVisibleButtons,
  getHiddenButtons,
  getDefaultToolbarConfig,
} from '../types/toolbar-config.types';
import { toolbarConfigService } from '../services/toolbar-config-service';

/**
 * Context 类型定义
 */
interface ToolbarConfigContextType {
  /** 当前配置 */
  config: ToolbarConfig;
  /** 是否正在加载 */
  loading: boolean;
  /** 可见按钮列表（已排序） */
  visibleButtons: ToolbarButtonConfig[];
  /** 隐藏按钮列表（已排序） */
  hiddenButtons: ToolbarButtonConfig[];
  /** 检查按钮是否可见 */
  isButtonVisible: (buttonId: string) => boolean;
  /** 设置按钮可见性 */
  setButtonVisibility: (buttonId: string, visible: boolean) => void;
  /** 显示按钮（从隐藏移到可见） */
  showButton: (buttonId: string, insertIndex?: number) => void;
  /** 隐藏按钮（从可见移到隐藏） */
  hideButton: (buttonId: string) => void;
  /** 重新排序按钮 */
  reorderButton: (fromIndex: number, toIndex: number, isVisibleList: boolean) => void;
  /** 重置为默认配置 */
  resetToDefault: () => void;
}

/**
 * 创建 Context
 */
const ToolbarConfigContext = createContext<ToolbarConfigContextType | null>(null);

/**
 * Provider Props
 */
interface ToolbarConfigProviderProps {
  children: ReactNode;
}

/**
 * 工具栏配置 Provider
 */
export const ToolbarConfigProvider: React.FC<ToolbarConfigProviderProps> = ({
  children,
}) => {
  const [config, setConfig] = useState<ToolbarConfig>(getDefaultToolbarConfig());
  const [loading, setLoading] = useState(true);

  // 初始化配置
  useEffect(() => {
    const initConfig = () => {
      try {
        const loadedConfig = toolbarConfigService.initialize();
        setConfig(loadedConfig);
      } catch (error) {
        console.error('[ToolbarConfigProvider] Failed to initialize:', error);
      } finally {
        setLoading(false);
      }
    };

    initConfig();
  }, []);

  // 计算可见和隐藏按钮列表
  const visibleButtons = useMemo(() => getVisibleButtons(config), [config]);
  const hiddenButtons = useMemo(() => getHiddenButtons(config), [config]);

  // 检查按钮是否可见
  const isButtonVisible = useCallback(
    (buttonId: string): boolean => {
      const button = config.buttons.find((btn) => btn.id === buttonId);
      return button?.visible ?? false;
    },
    [config]
  );

  // 设置按钮可见性
  const setButtonVisibility = useCallback(
    (buttonId: string, visible: boolean) => {
      const newConfig = toolbarConfigService.setButtonVisibility(buttonId, visible);
      setConfig(newConfig);
    },
    []
  );

  // 显示按钮
  const showButton = useCallback(
    (buttonId: string, insertIndex?: number) => {
      const newConfig = toolbarConfigService.showButton(buttonId, insertIndex);
      setConfig(newConfig);
    },
    []
  );

  // 隐藏按钮
  const hideButton = useCallback((buttonId: string) => {
    const newConfig = toolbarConfigService.hideButton(buttonId);
    setConfig(newConfig);
  }, []);

  // 重新排序按钮
  const reorderButton = useCallback(
    (fromIndex: number, toIndex: number, isVisibleList: boolean) => {
      const newConfig = toolbarConfigService.reorderButton(
        fromIndex,
        toIndex,
        isVisibleList
      );
      setConfig(newConfig);
    },
    []
  );

  // 重置为默认配置
  const resetToDefault = useCallback(() => {
    const newConfig = toolbarConfigService.resetToDefault();
    setConfig(newConfig);
  }, []);

  const value = useMemo(
    () => ({
      config,
      loading,
      visibleButtons,
      hiddenButtons,
      isButtonVisible,
      setButtonVisibility,
      showButton,
      hideButton,
      reorderButton,
      resetToDefault,
    }),
    [
      config,
      loading,
      visibleButtons,
      hiddenButtons,
      isButtonVisible,
      setButtonVisibility,
      showButton,
      hideButton,
      reorderButton,
      resetToDefault,
    ]
  );

  return (
    <ToolbarConfigContext.Provider value={value}>
      {children}
    </ToolbarConfigContext.Provider>
  );
};

/**
 * 使用工具栏配置 Hook
 */
export const useToolbarConfig = (): ToolbarConfigContextType => {
  const context = useContext(ToolbarConfigContext);

  if (!context) {
    throw new Error(
      'useToolbarConfig must be used within ToolbarConfigProvider'
    );
  }

  return context;
};
