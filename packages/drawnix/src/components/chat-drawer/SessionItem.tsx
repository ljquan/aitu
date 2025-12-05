/**
 * SessionItem Component
 *
 * Displays a single chat session in the session list.
 */

import React, { useCallback, useMemo } from 'react';
import { DeleteIcon } from 'tdesign-icons-react';
import type { SessionItemProps } from '../../types/chat.types';

export const SessionItem: React.FC<SessionItemProps> = React.memo(
  ({ session, isActive, onSelect, onDelete }) => {
    const handleClick = useCallback(() => {
      onSelect();
    }, [onSelect]);

    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
      },
      [onDelete]
    );

    const formattedTime = useMemo(() => {
      const date = new Date(session.updatedAt);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      if (isToday) {
        return date.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
      });
    }, [session.updatedAt]);

    return (
      <div
        className={`session-item ${isActive ? 'session-item--active' : ''}`}
        data-track="chat_click_session_select"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <div className="session-item__content">
          <div className="session-item__title">{session.title}</div>
          <div className="session-item__time">{formattedTime}</div>
        </div>
        <button
          className="session-item__delete"
          data-track="chat_click_session_delete"
          onClick={handleDelete}
          aria-label={`删除会话: ${session.title}`}
        >
          <DeleteIcon size={14} />
        </button>
      </div>
    );
  }
);

SessionItem.displayName = 'SessionItem';
