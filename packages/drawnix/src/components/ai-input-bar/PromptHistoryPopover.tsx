/**
 * PromptHistoryPopover 组件
 *
 * 历史提示词悬浮面板
 * - 三个点图标按钮（始终显示）
 * - 鼠标悬浮时显示历史提示词列表和预设提示词
 * - 支持置顶/取消置顶
 * - 点击提示词回填到输入框
 * - 支持删除历史记录
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { usePromptHistory } from '../../hooks/usePromptHistory';
import { PromptListPanel, type PromptItem } from '../shared';
import { AI_COLD_START_SUGGESTIONS } from '../../constants/prompts';
import './prompt-history-popover.scss';

/** 选择提示词回调的参数类型 */
export interface PromptSelectInfo {
  content: string;
  /** 生成类型：image(直接生图)、video(直接生视频)、agent(需要Agent分析) */
  modelType?: 'image' | 'video' | 'agent';
  scene?: string;
}

interface PromptHistoryPopoverProps {
  /** 选择提示词后的回调 */
  onSelectPrompt: (info: PromptSelectInfo) => void;
  /** 语言 */
  language: 'zh' | 'en';
}

export const PromptHistoryPopover: React.FC<PromptHistoryPopoverProps> = ({
  onSelectPrompt,
  language,
}) => {
  // 禁用预设去重，因为我们会在下面自己处理去重
  const { history, removeHistory, togglePinHistory, refreshHistory } = usePromptHistory({
    deduplicateWithPresets: false,
  });
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 获取预设提示词（冷启动建议）
  const presetPrompts = useMemo(() => {
    const suggestions = AI_COLD_START_SUGGESTIONS[language] || [];
    return suggestions.map((s, index) => ({
      id: `preset_${index}`,
      content: s.content,
      isPreset: true,
      modelType: s.modelType,
      scene: s.scene,
    }));
  }, [language]);

  // 合并历史记录和预设提示词，去重
  const promptItems: PromptItem[] = useMemo(() => {
    // 历史记录
    const historyItems: PromptItem[] = history.map(item => ({
      id: item.id,
      content: item.content,
      pinned: item.pinned,
    }));

    // 获取历史记录中的内容集合（用于去重）
    const historyContents = new Set(history.map(h => h.content.trim().toLowerCase()));

    // 过滤掉与历史记录重复的预设
    const filteredPresets: PromptItem[] = presetPrompts
      .filter(p => !historyContents.has(p.content.trim().toLowerCase()))
      .map(p => ({
        id: p.id,
        content: p.content,
        pinned: false,
        isPreset: true,
        modelType: p.modelType,
        scene: p.scene,
      }));

    return [...historyItems, ...filteredPresets];
  }, [history, presetPrompts]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  // 处理鼠标进入
  const handleMouseEnter = useCallback(() => {
    // 清除离开定时器
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    // 延迟显示面板（避免误触）
    hoverTimeoutRef.current = setTimeout(() => {
      // 打开前刷新历史记录，确保显示最新数据
      refreshHistory();
      setIsOpen(true);
    }, 150);
  }, [refreshHistory]);

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    // 清除进入定时器
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // 延迟关闭面板（允许鼠标移动到面板上）
    leaveTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, []);

  // 处理选择提示词
  const handleSelectPrompt = useCallback((item: PromptItem) => {
    onSelectPrompt({
      content: item.content,
      modelType: item.modelType,
      scene: item.scene,
    });
    setIsOpen(false);
  }, [onSelectPrompt]);

  // 处理删除（只允许删除历史记录，不允许删除预设）
  const handleDelete = useCallback((id: string) => {
    // 预设提示词的 id 以 preset_ 开头，不允许删除
    if (id.startsWith('preset_')) {
      return;
    }
    removeHistory(id);
  }, [removeHistory]);

  // 处理置顶切换（只允许置顶历史记录）
  const handleTogglePin = useCallback((id: string) => {
    // 预设提示词的 id 以 preset_ 开头，不允许置顶
    if (id.startsWith('preset_')) {
      return;
    }
    togglePinHistory(id);
  }, [togglePinHistory]);

  return (
    <div
      ref={containerRef}
      className="prompt-history-popover"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 提示词按钮 */}
      <button
        className="prompt-history-popover__trigger"
        title={language === 'zh' ? '提示词' : 'Prompts'}
        data-track="ai_input_click_history"
      >
        <MoreHorizontal size={18} />
      </button>

      {/* 提示词面板 */}
      {isOpen && (
        <div className="prompt-history-popover__panel-wrapper">
          <PromptListPanel
            title={language === 'zh' ? '提示词' : 'Prompts'}
            items={promptItems}
            onSelect={handleSelectPrompt}
            onTogglePin={handleTogglePin}
            onDelete={handleDelete}
            language={language}
            showCount={true}
          />
        </div>
      )}
    </div>
  );
};

export default PromptHistoryPopover;
