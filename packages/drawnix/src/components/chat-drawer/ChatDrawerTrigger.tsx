/**
 * ChatDrawerTrigger Component
 *
 * Button to toggle the chat drawer open/closed.
 */

import React from 'react';
import { Tooltip } from 'tdesign-react';
import { ChevronLeftIcon } from 'tdesign-icons-react';

interface ChatDrawerTriggerProps {
  isOpen: boolean;
  onClick: () => void;
  drawerWidth?: number;
}

export const ChatDrawerTrigger: React.FC<ChatDrawerTriggerProps> = React.memo(
  ({ isOpen, onClick, drawerWidth }) => {
    // 当抽屉打开时，根据抽屉宽度计算触发器位置
    const style = isOpen && drawerWidth ? { right: drawerWidth - 18 } : undefined;
    
    return (
      <Tooltip content={isOpen ? '收起对话' : '展开对话'} theme="light">
        <button
          className={`chat-drawer-trigger ${isOpen ? 'chat-drawer-trigger--active' : ''}`}
          data-track={isOpen ? 'chat_click_drawer_close' : 'chat_click_drawer_open'}
          onClick={onClick}
          aria-label={isOpen ? '收起对话' : '展开对话'}
          aria-expanded={isOpen}
          style={style}
        >
          <ChevronLeftIcon size={16} className="chat-drawer-trigger__icon" />
        </button>
      </Tooltip>
    );
  }
);

ChatDrawerTrigger.displayName = 'ChatDrawerTrigger';
