/**
 * 用户消息气泡组件
 * 
 * 支持显示用户输入的文本和图片
 */

import React, { useMemo } from 'react';
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

        {/* 文本内容 */}
        {text && (
          <div className="user-bubble__text">
            {text}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserMessageBubble;
