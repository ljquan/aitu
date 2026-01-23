/**
 * CharacterCard Component
 *
 * Displays a single character with avatar, username, and actions.
 * Supports different states: processing, completed, failed.
 */

import React, { useCallback, useState } from 'react';
import { Button, Tooltip, MessagePlugin, Loading } from 'tdesign-react';
import { DeleteIcon, CopyIcon, UserIcon } from 'tdesign-icons-react';
import type { SoraCharacter } from '../../types/character.types';
import { CharacterAvatar } from './CharacterAvatar';
import { MediaViewer } from '../shared/MediaViewer';
import './character.scss';

export interface CharacterCardProps {
  /** The character to display */
  character: SoraCharacter;
  /** Callback when delete button is clicked */
  onDelete?: (id: string) => void;
  /** Callback when character is selected */
  onSelect?: (character: SoraCharacter) => void;
  /** Whether the card is compact (for inline display) */
  compact?: boolean;
}

/**
 * CharacterCard component - displays a single character
 */
export const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  onDelete,
  onSelect,
  compact = false,
}) => {
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const isProcessing = character.status === 'processing' || character.status === 'pending';
  const isFailed = character.status === 'failed';
  const isCompleted = character.status === 'completed';

  // Copy username to clipboard
  const handleCopyUsername = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!character.username) return;

    const mention = `@${character.username}`;
    try {
      await navigator.clipboard.writeText(mention);
      MessagePlugin.success(`已复制: ${mention}`);
    } catch (err) {
      console.error('Failed to copy:', err);
      MessagePlugin.error('复制失败');
    }
  }, [character.username]);

  // Handle card click
  const handleClick = useCallback(() => {
    if (isCompleted && onSelect) {
      onSelect(character);
    }
  }, [isCompleted, onSelect, character]);

  // Handle delete click
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(character.id);
  }, [onDelete, character.id]);

  // Handle avatar click to open image viewer
  const handleAvatarClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompleted && character.profilePictureUrl) {
      setImageViewerVisible(true);
    }
  }, [isCompleted, character.profilePictureUrl]);

  // Render avatar with cache support
  const renderAvatar = () => {
    if (character.profilePictureUrl || isCompleted) {
      return (
        <Tooltip content="点击查看大图" theme="light">
          <CharacterAvatar
            characterId={character.id}
            profilePictureUrl={character.profilePictureUrl}
            alt={character.username || 'Character'}
            className="character-card__avatar-img"
            onClick={handleAvatarClick}
          />
        </Tooltip>
      );
    }
    return (
      <div className="character-card__avatar-placeholder">
        <UserIcon />
      </div>
    );
  };

  // Render status
  const renderStatus = () => {
    if (isProcessing) {
      return (
        <div className="character-card__status character-card__status--processing">
          <Loading size="small" />
          <span>创建中...</span>
        </div>
      );
    }
    if (isFailed) {
      return (
        <div className="character-card__status character-card__status--failed">
          创建失败: {character.error || '未知错误'}
        </div>
      );
    }
    return null;
  };

  if (compact) {
    // Compact mode for inline display
    return (
      <div
        className={`character-card character-card--compact ${isProcessing ? 'character-card--loading' : ''} ${isFailed ? 'character-card--failed' : ''}`}
        onClick={handleClick}
      >
        <div className="character-card__avatar">{renderAvatar()}</div>
        <span className="character-card__username-text">
          {character.username || '创建中...'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`character-card ${isProcessing ? 'character-card--loading' : ''} ${isFailed ? 'character-card--failed' : ''}`}
      onClick={handleClick}
    >
      {/* Avatar */}
      <div className="character-card__avatar">{renderAvatar()}</div>

      {/* Info */}
      <div className="character-card__info">
        {/* Username with copy button */}
        {isCompleted && character.username ? (
          <Tooltip content="点击复制" theme="light">
            <div
              className="character-card__username"
              onClick={handleCopyUsername}
            >
              @{character.username}
              <CopyIcon className="character-card__username-copy" />
            </div>
          </Tooltip>
        ) : (
          <div className="character-card__username" style={{ cursor: 'default' }}>
            {isProcessing ? '创建中...' : '角色'}
          </div>
        )}

        {/* Character ID */}
        {character.id && (
          <Tooltip content={character.id} theme="light" placement="bottom">
            <div className="character-card__source">{character.id}</div>
          </Tooltip>
        )}

        {/* Status */}
        {renderStatus()}
      </div>

      {/* Actions */}
      <div className="character-card__actions">
        <Tooltip content="删除角色" theme="light">
          <Button
            size="small"
            variant="text"
            theme="danger"
            icon={<DeleteIcon />}
            data-track="character_click_delete"
            onClick={handleDelete}
          />
        </Tooltip>
      </div>

      {/* Image Viewer for avatar */}
      {character.profilePictureUrl && (
        <MediaViewer
          visible={imageViewerVisible}
          onClose={() => setImageViewerVisible(false)}
          items={[{
            url: character.profilePictureUrl,
            type: 'image',
            title: `@${character.username || 'Character'}`,
          }]}
        />
      )}
    </div>
  );
};

export default CharacterCard;
