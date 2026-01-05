/**
 * EnhancedChatInput Component
 *
 * 增强版聊天输入框，支持：
 * - # 指定模型
 * - - 指定参数
 * - + 指定数量
 * - 选中元素展示
 *
 * 使用 useSmartInput hook 复用 AIInputBar 的输入逻辑
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { SendIcon } from 'tdesign-icons-react';
import { SmartSuggestionPanel } from '../ai-input-bar/smart-suggestion-panel';
import { SelectedContentPreview } from '../shared/SelectedContentPreview';
import type { SelectedContentItem } from '../../contexts/ChatDrawerContext';
import type { Message } from '@llamaindex/chat-ui';
import { useSmartInput } from '../../hooks/useSmartInput';

interface EnhancedChatInputProps {
  selectedContent: SelectedContentItem[];
  onSend: (message: Message) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const EnhancedChatInput: React.FC<EnhancedChatInputProps> = ({
  selectedContent,
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasSelection = selectedContent.length > 0;

  // 使用共享的智能输入 hook
  const {
    input,
    setInput,
    showSuggestion,
    parseResult,
    handleSelectModel,
    handleSelectParam,
    handleSelectCount,
    handleSelectPrompt,
    handleCloseSuggestion,
  } = useSmartInput({
    hasSelection,
    passiveOnly: true, // 只被动触发
    inputRef: textareaRef,
    containerRef,
  });

  const { mode, keyword } = parseResult;

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput && selectedContent.length === 0) return;

    // 构建消息
    const parts: Message['parts'] = [];

    // 添加文本
    if (trimmedInput) {
      parts.push({ type: 'text', text: trimmedInput });
    }

    // 添加选中的图片/视频
    selectedContent.forEach((item, index) => {
      if (item.type === 'image' || item.type === 'graphics') {
        parts.push({
          type: 'data-file',
          data: {
            filename: `${item.type}-${index + 1}.png`,
            mediaType: 'image/png',
            url: item.url || '',
          },
        } as any);
      } else if (item.type === 'video') {
        parts.push({
          type: 'data-file',
          data: {
            filename: `video-${index + 1}.mp4`,
            mediaType: 'video/mp4',
            url: item.url || '',
          },
        } as any);
      }
    });

    const message: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      parts,
    };

    onSend(message);
    setInput('');
  }, [input, selectedContent, onSend, setInput]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 检测 IME 组合输入状态（如中文拼音输入法）
    // 在组合输入时按回车是确认拼音转换，不应触发发送
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      handleCloseSuggestion();
    }
  }, [handleSend, handleCloseSuggestion]);

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // 渲染选中内容预览（使用公共组件）
  const renderSelectedContent = () => {
    if (selectedContent.length === 0) return null;

    return (
      <div className="enhanced-chat-input__selection">
        <SelectedContentPreview
          items={selectedContent}
          language="zh"
          enableHoverPreview={true}
        />
      </div>
    );
  };

  // 渲染高亮层（显示标签背景色）
  const renderHighlightLayer = () => {
    const { segments } = parseResult;
    if (!segments || !segments.some(s => s.type !== 'text')) return null;

    return (
      <div className="enhanced-chat-input__highlight-layer" aria-hidden="true">
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            return <span key={index} className="enhanced-chat-input__highlight-text">{segment.content}</span>;
          }
          let tagClass = '';
          switch (segment.type) {
            case 'image-model':
              tagClass = 'enhanced-chat-input__highlight-tag--image';
              break;
            case 'video-model':
              tagClass = 'enhanced-chat-input__highlight-tag--video';
              break;
            case 'param':
              tagClass = 'enhanced-chat-input__highlight-tag--param';
              break;
            case 'count':
              tagClass = 'enhanced-chat-input__highlight-tag--count';
              break;
          }
          return (
            <span key={index} className={`enhanced-chat-input__highlight-tag ${tagClass}`}>
              {segment.content}
            </span>
          );
        })}
      </div>
    );
  };

  const isActive = (input.trim() || selectedContent.length > 0) && !disabled;

  return (
    <div className="enhanced-chat-input" ref={containerRef}>
      {renderSelectedContent()}

      <div className="enhanced-chat-input__form">
        <div className="enhanced-chat-input__input-wrapper">
          {renderHighlightLayer()}
          <textarea
            ref={textareaRef}
            className="enhanced-chat-input__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasSelection ? '描述你想要的效果... (可用 # 指定模型)' : placeholder}
            disabled={disabled}
            rows={4}
          />
        </div>

        <button
          className={`enhanced-chat-input__send ${isActive ? 'enhanced-chat-input__send--active' : ''}`}
          onClick={handleSend}
          disabled={!isActive}
          aria-label="发送"
        >
          <SendIcon size={20} />
        </button>
      </div>

      {showSuggestion && mode && (
        <SmartSuggestionPanel
          visible={showSuggestion}
          mode={mode}
          filterKeyword={keyword}
          selectedImageModel={parseResult.selectedImageModel}
          selectedVideoModel={parseResult.selectedVideoModel}
          selectedParams={parseResult.selectedParams}
          selectedCount={parseResult.selectedCount}
          onSelectModel={handleSelectModel}
          onSelectParam={handleSelectParam}
          onSelectCount={handleSelectCount}
          onSelectPrompt={handleSelectPrompt}
          onClose={handleCloseSuggestion}
        />
      )}
    </div>
  );
};

export default EnhancedChatInput;
