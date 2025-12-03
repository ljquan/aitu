/**
 * ChatDrawerTrigger Component
 *
 * Button to toggle the chat drawer open/closed.
 */

import React from 'react';
import { Tooltip } from 'tdesign-react';
import { ChevronRightIcon } from 'tdesign-icons-react';

interface ChatDrawerTriggerProps {
  isOpen: boolean;
  onClick: () => void;
}

export const ChatDrawerTrigger: React.FC<ChatDrawerTriggerProps> = React.memo(
  ({ isOpen, onClick }) => {
    return (
      <Tooltip content={isOpen ? '收起对话' : '展开对话'} theme="light">
        <button
          className={`chat-drawer-trigger ${isOpen ? 'chat-drawer-trigger--active' : ''}`}
          onClick={onClick}
          aria-label={isOpen ? '收起对话' : '展开对话'}
          aria-expanded={isOpen}
        >
          <ChevronRightIcon size={16} className="chat-drawer-trigger__icon" />
        </button>
      </Tooltip>
    );
  }
);

ChatDrawerTrigger.displayName = 'ChatDrawerTrigger';
