/**
 * SmartSuggestionPanel 组件
 * 
 * 统一的智能建议面板，支持：
 * - # 模型选择
 * - - 参数提示
 * - + 生成个数选择
 * - 默认提示词
 */

import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import {
  Bot, Check, Image, Video, Settings, Hash, Plus,
  History, Lightbulb, X, Sparkles
} from 'lucide-react';
import { getModelConfig, type ModelType, type ParamConfig } from '../../../constants/model-config';
import { useParameterFilter } from './hooks/useParameterFilter';
import type { 
  SmartSuggestionPanelProps, 
  SuggestionItem,
  SuggestionMode,
  PromptItem,
} from './types';
import './smart-suggestion-panel.scss';

/**
 * 获取模式标题
 */
function getModeTitle(mode: SuggestionMode, language: 'zh' | 'en', pendingParam?: ParamConfig | null): string {
  // 如果有待选参数，显示参数名
  if (pendingParam) {
    const paramLabel = pendingParam.shortLabel || pendingParam.label;
    return language === 'zh' ? `选择 ${paramLabel}` : `Select ${paramLabel}`;
  }

  const titles: Record<string, string> = {
    model: language === 'zh' ? '选择模型' : 'Select Model',
    param: language === 'zh' ? '选择参数' : 'Select Parameter',
    count: language === 'zh' ? '生成数量' : 'Select Count',
    prompt: language === 'zh' ? '提示词' : 'Prompts',
    'cold-start': language === 'zh' ? '试试这些创意' : 'Try these ideas',
  };
  return mode ? titles[mode] || '' : '';
}

/**
 * 获取模式图标
 */
function getModeIcon(mode: SuggestionMode): React.ReactNode {
  switch (mode) {
    case 'model':
      return <Bot size={16} />;
    case 'param':
      return <Settings size={16} />;
    case 'count':
      return <Plus size={16} />;
    case 'prompt':
      return <Lightbulb size={16} />;
    case 'cold-start':
      return <Sparkles size={16} />;
    default:
      return null;
  }
}

/**
 * 获取键盘提示
 */
function getKeyboardHint(language: 'zh' | 'en'): string {
  return language === 'zh' ? '↑↓选择 Tab确认' : '↑↓ to select, Tab to confirm';
}

/**
 * SmartSuggestionPanel 组件
 */
export const SmartSuggestionPanel: React.FC<SmartSuggestionPanelProps> = ({
  visible,
  mode,
  filterKeyword,
  selectedImageModel,
  selectedVideoModel,
  selectedParams,
  selectedCount,
  prompts = [],
  selectionHistoryPrompts = [],
  onSelectModel,
  onSelectParam,
  onSelectCount,
  onSelectPrompt,
  onDeleteHistory,
  onClose,
  language = 'zh',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // 待选枚举值的参数（选择参数后自动展开枚举值）
  const [pendingParam, setPendingParam] = useState<ParamConfig | null>(null);
  // 枚举值过滤关键词
  const [enumKeyword, setEnumKeyword] = useState('');

  // 当 mode 或 visible 变化时，清除待选参数状态
  useEffect(() => {
    if (!visible || mode !== 'param') {
      setPendingParam(null);
      setEnumKeyword('');
    }
  }, [visible, mode]);

  // 获取过滤后的建议列表
  const suggestions = useParameterFilter({
    mode,
    keyword: pendingParam ? enumKeyword : filterKeyword,
    selectedImageModel,
    selectedVideoModel,
    selectedParams,
    selectedCount,
    prompts,
    pendingParam: pendingParam || undefined,
  });

  // 当只有1个参数且有枚举值时，自动展开到枚举值选择
  useEffect(() => {
    if (mode === 'param' && !pendingParam && suggestions.length === 1) {
      const singleSuggestion = suggestions[0];
      if (singleSuggestion.type === 'param' && 
          singleSuggestion.paramConfig.options && 
          singleSuggestion.paramConfig.options.length > 0) {
        // 自动进入枚举值选择模式
        setPendingParam(singleSuggestion.paramConfig);
        setEnumKeyword('');
        setHighlightedIndex(0);
      }
    }
  }, [mode, suggestions, pendingParam]);

  // 分组提示词（历史 + 预设），也用于冷启动模式和 model 模式
  const { historyPrompts, presetPrompts, coldStartSuggestions, coldStartHistoryPrompts, modelModeHistoryPrompts } = useMemo(() => {
    if (mode === 'cold-start') {
      // 冷启动模式：分开历史记录和预设引导提示词
      const allColdStart = suggestions.filter(s => s.type === 'cold-start');
      // 根据原始 prompts 的 source 来区分
      const historyIds = new Set(prompts.filter(p => p.source === 'history').map(p => p.id));
      const coldStartHistory = allColdStart.filter(s => historyIds.has(s.id));
      const coldStartPreset = allColdStart.filter(s => !historyIds.has(s.id));
      return {
        historyPrompts: [],
        presetPrompts: [],
        coldStartSuggestions: coldStartPreset,
        coldStartHistoryPrompts: coldStartHistory,
        modelModeHistoryPrompts: [],
      };
    }
    if (mode === 'model') {
      // model 模式下，过滤历史记录（排除只有 #模型名 的记录）
      const filteredHistory = selectionHistoryPrompts
        .filter(item => {
          const content = item.content.trim();
          // 排除只有 #模型名 的记录（例如 "#gemini" 这种只有模型标记的）
          const onlyModelPattern = /^#[\w.-]+$/;
          return !onlyModelPattern.test(content);
        })
        .map(item => ({
          id: item.id,
          type: 'prompt' as const,
          label: item.content,
          shortLabel: item.content, // CSS 控制省略显示
          description: '',
          source: 'history' as const,
          content: item.content,
          timestamp: item.timestamp,
        }));
      return { historyPrompts: [], presetPrompts: [], coldStartSuggestions: [], coldStartHistoryPrompts: [], modelModeHistoryPrompts: filteredHistory };
    }
    if (mode !== 'prompt') {
      return { historyPrompts: [], presetPrompts: [], coldStartSuggestions: [], coldStartHistoryPrompts: [], modelModeHistoryPrompts: [] };
    }
    const history = suggestions.filter(s => s.type === 'prompt' && s.source === 'history');
    const preset = suggestions.filter(s => s.type === 'prompt' && s.source === 'preset');
    return { historyPrompts: history, presetPrompts: preset, coldStartSuggestions: [], coldStartHistoryPrompts: [], modelModeHistoryPrompts: [] };
  }, [mode, suggestions, selectionHistoryPrompts, prompts]);

  // 非提示词模式的建议列表
  const nonPromptSuggestions = useMemo(() => {
    if (mode === 'prompt' || mode === 'cold-start') return [];
    return suggestions;
  }, [mode, suggestions]);

  // 合并后的列表（用于键盘导航）
  const allSuggestions = useMemo(() => {
    if (mode === 'cold-start') {
      // 冷启动模式：历史记录 + 预设提示词
      return [...coldStartHistoryPrompts, ...coldStartSuggestions];
    }
    if (mode === 'prompt') {
      return [...historyPrompts, ...presetPrompts];
    }
    if (mode === 'model') {
      // model 模式下，历史记录在上方 + 模型列表在下方
      return [...modelModeHistoryPrompts, ...nonPromptSuggestions];
    }
    return nonPromptSuggestions;
  }, [mode, historyPrompts, presetPrompts, nonPromptSuggestions, coldStartSuggestions, coldStartHistoryPrompts, modelModeHistoryPrompts]);

  // 重置高亮索引
  useEffect(() => {
    setHighlightedIndex(0);
  }, [allSuggestions.length, mode]);

  // 处理选择
  const handleSelect = useCallback((item: SuggestionItem) => {
    switch (item.type) {
      case 'model':
        onSelectModel(item.id);
        break;
      case 'param':
        // 如果已经有值（从枚举值列表选择），直接插入完整参数
        if (item.value) {
          onSelectParam(item.paramConfig.id, item.value);
          setPendingParam(null);
          setEnumKeyword('');
        } 
        // 如果参数有枚举值选项，进入枚举值选择模式
        else if (item.paramConfig.options && item.paramConfig.options.length > 0) {
          setPendingParam(item.paramConfig);
          setEnumKeyword('');
          setHighlightedIndex(0);
        }
        // 非枚举参数，直接插入参数名
        else {
          onSelectParam(item.paramConfig.id);
        }
        break;
      case 'count':
        onSelectCount(item.value);
        break;
      case 'prompt':
        onSelectPrompt?.({
          id: item.id,
          content: item.content,
          source: item.source,
          timestamp: item.timestamp,
        });
        break;
      case 'cold-start':
        // 冷启动提示词选择后，填入输入框
        onSelectPrompt?.({
          id: item.id,
          content: item.content,
          source: 'preset',
        });
        break;
    }
  }, [onSelectModel, onSelectParam, onSelectCount, onSelectPrompt]);

  // 键盘事件监听
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 没有建议时只处理 Escape
      if (allSuggestions.length === 0) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setHighlightedIndex(prev =>
            prev <= 0 ? allSuggestions.length - 1 : prev - 1
          );
          break;
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setHighlightedIndex(prev =>
            prev >= allSuggestions.length - 1 ? 0 : prev + 1
          );
          break;
        case 'Tab':
          event.preventDefault();
          event.stopPropagation();
          if (allSuggestions[highlightedIndex]) {
            handleSelect(allSuggestions[highlightedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
        // Enter 不拦截，让 AIInputBar 处理发送
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, allSuggestions, highlightedIndex, handleSelect, onClose]);

  // 滚动高亮项到可见区域
  useEffect(() => {
    if (!visible || allSuggestions.length === 0) return;
    
    const highlightedElement = panelRef.current?.querySelector(
      '.smart-suggestion-panel__item--highlighted'
    );
    if (highlightedElement) {
      highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex, visible, allSuggestions.length]);

  // 处理删除历史
  const handleDeleteHistory = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteHistory?.(id);
  }, [onDeleteHistory]);

  // 获取全局索引（提示词模式）
  const getGlobalIndex = useCallback((source: 'history' | 'preset', localIndex: number) => {
    if (source === 'history') return localIndex;
    return historyPrompts.length + localIndex;
  }, [historyPrompts.length]);

  if (!visible || !mode) return null;

  // 检查是否两种模型都已选择（模型模式特殊处理）
  const allModelsSelected = mode === 'model' && !!selectedImageModel && !!selectedVideoModel;

  // 如果模型都已选择，显示完成提示
  if (allModelsSelected) {
    return (
      <div 
        ref={panelRef}
        className="smart-suggestion-panel"
        role="dialog"
        aria-label={language === 'zh' ? '模型已选择' : 'Models Selected'}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="smart-suggestion-panel__header">
          <Bot size={16} />
          <span>{language === 'zh' ? '模型已选择' : 'Models Selected'}</span>
        </div>
        <div className="smart-suggestion-panel__complete-message">
          <div className="smart-suggestion-panel__selected-models">
            <div className="smart-suggestion-panel__selected-item">
              <Image size={14} />
              <span className="smart-suggestion-panel__selected-label">
                {language === 'zh' ? '图片' : 'Image'}:
              </span>
              <span className="smart-suggestion-panel__selected-name">
                {getModelConfig(selectedImageModel)?.shortLabel || 
                 getModelConfig(selectedImageModel)?.label || 
                 selectedImageModel}
              </span>
              <Check size={14} className="smart-suggestion-panel__selected-check" />
            </div>
            <div className="smart-suggestion-panel__selected-item">
              <Video size={14} />
              <span className="smart-suggestion-panel__selected-label">
                {language === 'zh' ? '视频' : 'Video'}:
              </span>
              <span className="smart-suggestion-panel__selected-name">
                {getModelConfig(selectedVideoModel)?.shortLabel || 
                 getModelConfig(selectedVideoModel)?.label || 
                 selectedVideoModel}
              </span>
              <Check size={14} className="smart-suggestion-panel__selected-check" />
            </div>
          </div>
          <p className="smart-suggestion-panel__hint-text">
            {language === 'zh' 
              ? '已选择图片和视频模型，无需再指定其他模型' 
              : 'Image and video models selected, no need to specify more'}
          </p>
        </div>
      </div>
    );
  }

  // 没有建议时不显示
  if (allSuggestions.length === 0) return null;

  // 渲染冷启动模式（创意引导）
  if (mode === 'cold-start') {
    const hasColdStartHistory = coldStartHistoryPrompts.length > 0;

    return (
      <div
        ref={panelRef}
        className="smart-suggestion-panel smart-suggestion-panel--cold-start"
        role="listbox"
        aria-label={getModeTitle(mode, language)}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="smart-suggestion-panel__content">
          {/* 历史记录区域 */}
          {hasColdStartHistory && (
            <div className="smart-suggestion-panel__section">
              <div className="smart-suggestion-panel__section-header">
                <History size={14} />
                <span>{language === 'zh' ? '历史记录' : 'History'}</span>
              </div>
              <div className="smart-suggestion-panel__list">
                {coldStartHistoryPrompts.map((item, index) => (
                  <div
                    key={item.id}
                    className={`smart-suggestion-panel__item smart-suggestion-panel__item--history ${
                      index === highlightedIndex
                        ? 'smart-suggestion-panel__item--highlighted'
                        : ''
                    }`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    title={item.label}
                  >
                    <span className="smart-suggestion-panel__item-text">
                      {item.shortLabel || item.label}
                    </span>
                    {onDeleteHistory && (
                      <button
                        className="smart-suggestion-panel__item-delete"
                        onClick={(e) => handleDeleteHistory(e, item.id)}
                        title={language === 'zh' ? '删除' : 'Delete'}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 预设创意提示词区域 */}
          {coldStartSuggestions.length > 0 && (
            <div className="smart-suggestion-panel__section">
              <div className="smart-suggestion-panel__section-header">
                {getModeIcon(mode)}
                <span>{getModeTitle(mode, language)}</span>
                <span className="smart-suggestion-panel__hint">
                  {getKeyboardHint(language)}
                </span>
              </div>
              <div className="smart-suggestion-panel__list smart-suggestion-panel__list--cold-start">
                {coldStartSuggestions.map((item, index) => {
                  const globalIndex = coldStartHistoryPrompts.length + index;
                  return (
                    <div
                      key={item.id}
                      className={`smart-suggestion-panel__item smart-suggestion-panel__item--cold-start ${
                        globalIndex === highlightedIndex
                          ? 'smart-suggestion-panel__item--highlighted'
                          : ''
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setHighlightedIndex(globalIndex)}
                    >
                      <div className="smart-suggestion-panel__item-content">
                        <span className="smart-suggestion-panel__item-text">
                          {item.shortLabel || item.label}
                        </span>
                        {item.type === 'cold-start' && (item.scene || item.tips) && (
                          <div className="smart-suggestion-panel__item-meta">
                            {item.scene && (
                              <span className="smart-suggestion-panel__item-scene">
                                {item.scene}
                              </span>
                            )}
                            {item.tips && (
                              <span className="smart-suggestion-panel__item-tips">
                                {item.tips}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 渲染提示词模式（分组显示）
  if (mode === 'prompt') {
    return (
      <div 
        ref={panelRef}
        className="smart-suggestion-panel smart-suggestion-panel--prompt"
        role="listbox"
        aria-label={getModeTitle(mode, language)}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="smart-suggestion-panel__content">
          {/* 历史提示词 */}
          {historyPrompts.length > 0 && (
            <div className="smart-suggestion-panel__section">
              <div className="smart-suggestion-panel__section-header">
                <History size={14} />
                <span>{language === 'zh' ? '历史记录' : 'History'}</span>
              </div>
              <div className="smart-suggestion-panel__list">
                {historyPrompts.map((item, index) => (
                  <div
                    key={item.id}
                    className={`smart-suggestion-panel__item smart-suggestion-panel__item--history ${
                      getGlobalIndex('history', index) === highlightedIndex
                        ? 'smart-suggestion-panel__item--highlighted'
                        : ''
                    }`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(getGlobalIndex('history', index))}
                    title={item.label}
                  >
                    <span className="smart-suggestion-panel__item-text">
                      {item.shortLabel || item.label}
                    </span>
                    {onDeleteHistory && (
                      <button
                        className="smart-suggestion-panel__item-delete"
                        onClick={(e) => handleDeleteHistory(e, item.id)}
                        title={language === 'zh' ? '删除' : 'Delete'}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 预设提示词 */}
          {presetPrompts.length > 0 && (
            <div className="smart-suggestion-panel__section">
              <div className="smart-suggestion-panel__section-header">
                <Lightbulb size={14} />
                <span>{language === 'zh' ? '推荐指令' : 'Suggestions'}</span>
              </div>
              <div className="smart-suggestion-panel__list">
                {presetPrompts.map((item, index) => (
                  <div
                    key={item.id}
                    className={`smart-suggestion-panel__item ${
                      getGlobalIndex('preset', index) === highlightedIndex 
                        ? 'smart-suggestion-panel__item--highlighted' 
                        : ''
                    }`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(getGlobalIndex('preset', index))}
                  >
                    <div className="smart-suggestion-panel__item-content">
                      <span className="smart-suggestion-panel__item-text">
                        {item.shortLabel || item.label}
                      </span>
                      {item.type === 'prompt' && item.scene && (
                        <span className="smart-suggestion-panel__item-scene">
                          {item.scene}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 渲染其他模式（模型、参数、个数）
  // model 模式下可能同时有历史记录
  const hasModelModeHistory = mode === 'model' && modelModeHistoryPrompts.length > 0;

  return (
    <div
      ref={panelRef}
      className={`smart-suggestion-panel smart-suggestion-panel--${mode}${pendingParam ? ' smart-suggestion-panel--enum-values' : ''}${hasModelModeHistory ? ' smart-suggestion-panel--with-history' : ''}`}
      role="listbox"
      aria-label={getModeTitle(mode, language, pendingParam)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="smart-suggestion-panel__content">
        {/* model 模式下的历史记录区域（放在模型列表上方） */}
        {hasModelModeHistory && (
          <div className="smart-suggestion-panel__section">
            <div className="smart-suggestion-panel__section-header">
              <History size={14} />
              <span>{language === 'zh' ? '历史记录' : 'History'}</span>
            </div>
            <div className="smart-suggestion-panel__list">
              {modelModeHistoryPrompts.map((item, index) => {
                const isHighlighted = highlightedIndex === index;
                return (
                  <div
                    key={item.id}
                    className={`smart-suggestion-panel__item smart-suggestion-panel__item--history ${
                      isHighlighted ? 'smart-suggestion-panel__item--highlighted' : ''
                    }`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    title={item.label}
                  >
                    <span className="smart-suggestion-panel__item-text">
                      {item.shortLabel || item.label}
                    </span>
                    {onDeleteHistory && (
                      <button
                        className="smart-suggestion-panel__item-delete"
                        onClick={(e) => handleDeleteHistory(e, item.id)}
                        title={language === 'zh' ? '删除' : 'Delete'}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 模型/参数/个数列表区域 */}
        <div className="smart-suggestion-panel__section">
          <div className="smart-suggestion-panel__section-header">
            {getModeIcon(mode)}
            <span>{getModeTitle(mode, language, pendingParam)}</span>
            <span className="smart-suggestion-panel__hint">
              {getKeyboardHint(language)}
            </span>
          </div>
          <div className="smart-suggestion-panel__list">
            {nonPromptSuggestions.map((item, index) => {
              // 历史记录在上方，所以模型的 globalIndex 需要加上历史记录的数量
              const globalIndex = hasModelModeHistory ? modelModeHistoryPrompts.length + index : index;
              const isHighlighted = highlightedIndex === globalIndex;
              // 使用 index 作为 key 以避免重复 id 问题（如多个 duration 参数）
              const uniqueKey = `${item.type}-${item.id}-${index}`;

              return (
                <div
                  key={uniqueKey}
                  className={`smart-suggestion-panel__item smart-suggestion-panel__item--${item.type} ${
                    isHighlighted ? 'smart-suggestion-panel__item--highlighted' : ''
                  }`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightedIndex(globalIndex)}
                  role="option"
                  aria-selected={isHighlighted}
                >
                  <div className="smart-suggestion-panel__item-content">
                    <div className="smart-suggestion-panel__item-name">
                      {/* 模型模式显示 #modelId */}
                      {item.type === 'model' && (
                        <>
                          <span className={`smart-suggestion-panel__item-id smart-suggestion-panel__item-id--${item.modelType}`}>
                            #{item.id}
                          </span>
                          <span className="smart-suggestion-panel__item-label">
                            {item.shortLabel || item.label}
                          </span>
                          <span className={`smart-suggestion-panel__item-type smart-suggestion-panel__item-type--${item.modelType}`}>
                            {item.modelType === 'image' ? <Image size={12} /> : <Video size={12} />}
                            {item.modelType === 'image'
                              ? (language === 'zh' ? '图片' : 'Image')
                              : (language === 'zh' ? '视频' : 'Video')
                            }
                          </span>
                        </>
                      )}

                      {/* 参数模式显示 -paramId */}
                      {item.type === 'param' && (
                        <>
                          <span className="smart-suggestion-panel__item-id smart-suggestion-panel__item-id--param">
                            -{item.value ? `${item.paramConfig.id}:${item.value}` : item.id}
                          </span>
                          <span className="smart-suggestion-panel__item-label">
                            {item.label}
                          </span>
                        </>
                      )}

                      {/* 个数模式显示简洁列表 */}
                      {item.type === 'count' && (
                        <>
                          <span className="smart-suggestion-panel__item-label">
                            {item.label}
                          </span>
                        </>
                      )}
                    </div>
                    {item.description && (
                      <div className="smart-suggestion-panel__item-desc">
                        {item.description}
                      </div>
                    )}
                  </div>
                  {/* 数量模式高亮时显示勾选图标 */}
                  {item.type === 'count' && isHighlighted && (
                    <Check size={16} className="smart-suggestion-panel__item-check" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartSuggestionPanel;
