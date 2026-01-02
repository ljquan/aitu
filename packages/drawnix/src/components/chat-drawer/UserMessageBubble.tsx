/**
 * 用户消息气泡组件
 * 
 * 支持显示用户输入的文本和图片
 * 支持文本选择和复制（不会取消画布选中态）
 */

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import type { Message, MessagePart } from '@llamaindex/chat-ui';
import './user-message-bubble.scss';

interface UserMessageBubbleProps {
  message: Message;
  className?: string;
}

interface ImageData {
  url: string;
  filename: string;
}

export const UserMessageBubble: React.FC<UserMessageBubbleProps> = ({
  message,
  className = '',
}) => {
  const textRef = useRef<HTMLDivElement>(null);

  // 解析消息内容
  const { text, images } = useMemo(() => {
    let textContent = '';
    const imageList: ImageData[] = [];

    for (const part of message.parts) {
      if (part.type === 'text') {
        textContent += (part as { type: 'text'; text: string }).text;
      } else if (part.type === 'data-file') {
        const data = (part as any).data;
        if (data?.mediaType?.startsWith('image/') || data?.url?.startsWith('data:image/')) {
          imageList.push({
            url: data.url,
            filename: data.filename || 'image',
          });
        }
      }
    }

    return { text: textContent, images: imageList };
  }, [message.parts]);

  // 阻止事件冒泡，防止取消画布选中态
  const handleStopPropagation = useCallback((e: Event) => {
    e.stopPropagation();
  }, []);

  // 处理复制快捷键
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isCopyShortcut = (e.ctrlKey || e.metaKey) && e.key === 'c';
    if (isCopyShortcut) {
      const selection = window.getSelection();
      const selectedText = selection?.toString();
      if (selectedText) {
        navigator.clipboard.writeText(selectedText).catch(err => {
          console.error('Failed to copy text:', err);
        });
        e.stopPropagation();
      }
    }
  }, []);

  // 添加事件监听器
  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    element.addEventListener('pointerdown', handleStopPropagation);
    element.addEventListener('pointerup', handleStopPropagation);
    element.addEventListener('mousedown', handleStopPropagation);
    element.addEventListener('mouseup', handleStopPropagation);
    element.addEventListener('click', handleStopPropagation);
    element.addEventListener('keydown', handleKeyDown as EventListener);

    return () => {
      element.removeEventListener('pointerdown', handleStopPropagation);
      element.removeEventListener('pointerup', handleStopPropagation);
      element.removeEventListener('mousedown', handleStopPropagation);
      element.removeEventListener('mouseup', handleStopPropagation);
      element.removeEventListener('click', handleStopPropagation);
      element.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [handleStopPropagation, handleKeyDown]);

  return (
    <div className={`user-bubble chat-message chat-message--user ${className}`}>
      <div className="chat-message-avatar">
        <span>👤</span>
      </div>
      <div className="user-bubble__content chat-message-content">
        {/* 图片网格 */}
        {images.length > 0 && (
          <div className={`user-bubble__images user-bubble__images--${Math.min(images.length, 4)}`}>
            {images.map((img, index) => (
              <div key={index} className="user-bubble__image-wrapper">
                <img
                  src={img.url}
                  alt={img.filename}
                  className="user-bubble__image"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}

        {/* 文本内容 - 支持选择和复制 */}
        {text && (
          <div 
            ref={textRef}
            className="user-bubble__text user-bubble__text--selectable"
          >
            {text}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserMessageBubble;
