/**
 * EnhancedChatInput Component
 *
 * 增强版聊天输入框，支持：
 * - 选中元素展示
 * - 多行文本输入
 */

import React, { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { SendIcon } from 'tdesign-icons-react';
import { SelectedContentPreview } from '../shared/SelectedContentPreview';
import type { SelectedContentItem } from '../../contexts/ChatDrawerContext';
import type { Message } from '@llamaindex/chat-ui';
import { usePromptHistory } from '../../hooks/usePromptHistory';

interface EnhancedChatInputProps {
  selectedContent: SelectedContentItem[];
  onSend: (message: Message) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * EnhancedChatInput Ref 接口
 */
export interface EnhancedChatInputRef {
  /** 设置输入框内容 */
  setContent: (content: string) => void;
  /** 获取输入框内容 */
  getContent: () => string;
  /** 聚焦输入框 */
  focus: () => void;
}

export const EnhancedChatInput = forwardRef<EnhancedChatInputRef, EnhancedChatInputProps>(({
  selectedContent,
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const hasSelection = selectedContent.length > 0;
  const { addHistory: addPromptHistory } = usePromptHistory();

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    setContent: (content: string) => {
      setInput(content);
      // 聚焦输入框
      textareaRef.current?.focus();
    },
    getContent: () => input,
    focus: () => textareaRef.current?.focus(),
  }), [input]);

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

    // 保存提示词到历史记录（Chat Drawer 默认为 Agent 模式）
    if (trimmedInput) {
      addPromptHistory(trimmedInput, hasSelection, 'agent');
    }

    onSend(message);
    setInput('');
  }, [input, selectedContent, onSend, addPromptHistory, hasSelection]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 检测 IME 组合输入状态（如中文拼音输入法）
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // 渲染选中内容预览
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

  const isActive = (input.trim() || selectedContent.length > 0) && !disabled;

  return (
    <div className="enhanced-chat-input" ref={containerRef}>
      {renderSelectedContent()}

      <div className="enhanced-chat-input__form">
        <div className="enhanced-chat-input__input-wrapper">
          <textarea
            ref={textareaRef}
            className="enhanced-chat-input__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasSelection ? '描述你想要的效果...' : placeholder}
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
    </div>
  );
});

EnhancedChatInput.displayName = 'EnhancedChatInput';

export default EnhancedChatInput;
