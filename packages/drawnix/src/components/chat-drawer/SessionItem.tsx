/**
 * SessionItem Component
 *
 * Displays a single chat session in the session list.
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { DeleteIcon, EditIcon } from 'tdesign-icons-react';
import type { SessionItemProps } from '../../types/chat.types';

export const SessionItem: React.FC<SessionItemProps> = React.memo(
  ({ session, isActive, onSelect, onDelete, onRename }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(session.title);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClick = useCallback(() => {
      if (!isEditing) {
        onSelect();
      }
    }, [onSelect, isEditing]);

    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
      },
      [onDelete]
    );

    const handleStartEdit = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setEditValue(session.title);
      setIsEditing(true);
    }, [session.title]);

    const handleSaveEdit = useCallback(() => {
      const trimmedValue = editValue.trim();
      if (trimmedValue && trimmedValue !== session.title) {
        onRename(trimmedValue);
      }
      setIsEditing(false);
    }, [editValue, session.title, onRename]);

    const handleCancelEdit = useCallback(() => {
      setEditValue(session.title);
      setIsEditing(false);
    }, [session.title]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEdit();
      }
    }, [handleSaveEdit, handleCancelEdit]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setEditValue(e.target.value);
    }, []);

    // 自动聚焦输入框
    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

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
        className={`session-item ${isActive ? 'session-item--active' : ''} ${isEditing ? 'session-item--editing' : ''}`}
        data-track="chat_click_session_select"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => !isEditing && e.key === 'Enter' && handleClick()}
      >
        <div className="session-item__content">
          {isEditing ? (
            <input
              ref={inputRef}
              className="session-item__title-input"
              value={editValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              onClick={(e) => e.stopPropagation()}
              maxLength={50}
            />
          ) : (
            <div className="session-item__title">{session.title}</div>
          )}
          <div className="session-item__time">{formattedTime}</div>
        </div>
        {!isEditing && (
          <div className="session-item__actions">
            <button
              className="session-item__edit"
              data-track="chat_click_session_edit"
              onClick={handleStartEdit}
              aria-label={`编辑会话标题: ${session.title}`}
            >
              <EditIcon size={14} />
            </button>
            <button
              className="session-item__delete"
              data-track="chat_click_session_delete"
              onClick={handleDelete}
              aria-label={`删除会话: ${session.title}`}
            >
              <DeleteIcon size={14} />
            </button>
          </div>
        )}
      </div>
    );
  }
);

SessionItem.displayName = 'SessionItem';
