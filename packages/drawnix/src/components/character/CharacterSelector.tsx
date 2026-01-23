/**
 * CharacterSelector Component
 *
 * A compact character selector for use in video generation dialogs.
 * Displays completed characters as selectable chips.
 */

import React, { useCallback, useMemo } from 'react';
import { Tooltip } from 'tdesign-react';
import { UserIcon, InfoCircleIcon } from 'tdesign-icons-react';
import { useCharacters } from '../../hooks/useCharacters';
import type { SoraCharacter } from '../../types/character.types';
import './character.scss';

export interface CharacterSelectorProps {
  /** Currently selected character IDs */
  selectedIds?: string[];
  /** Callback when selection changes */
  onSelectionChange?: (ids: string[]) => void;
  /** Whether to allow multiple selection */
  multiple?: boolean;
  /** Maximum characters to show before "show more" */
  maxVisible?: number;
}

/**
 * CharacterSelector component - compact character selection
 */
export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  selectedIds = [],
  onSelectionChange,
  multiple = false,
  maxVisible = 5,
}) => {
  const { completedCharacters, isLoading } = useCharacters();

  // Get visible characters
  const visibleCharacters = useMemo(() => {
    if (completedCharacters.length <= maxVisible) {
      return completedCharacters;
    }
    return completedCharacters.slice(0, maxVisible);
  }, [completedCharacters, maxVisible]);

  const hasMore = completedCharacters.length > maxVisible;

  // Handle character click
  const handleCharacterClick = useCallback((character: SoraCharacter) => {
    if (!onSelectionChange) return;

    if (multiple) {
      // Toggle selection
      if (selectedIds.includes(character.id)) {
        onSelectionChange(selectedIds.filter(id => id !== character.id));
      } else {
        onSelectionChange([...selectedIds, character.id]);
      }
    } else {
      // Single selection - toggle if already selected
      if (selectedIds.includes(character.id)) {
        onSelectionChange([]);
      } else {
        onSelectionChange([character.id]);
      }
    }
  }, [multiple, selectedIds, onSelectionChange]);

  // Get selected characters for display
  const getSelectedUsernames = useCallback(() => {
    return completedCharacters
      .filter(c => selectedIds.includes(c.id))
      .map(c => `@${c.username}`)
      .join(', ');
  }, [completedCharacters, selectedIds]);

  if (isLoading) {
    return null;
  }

  if (completedCharacters.length === 0) {
    return (
      <div className="character-selector">
        <div className="character-selector__label">
          <UserIcon style={{ marginRight: 4 }} />
          角色
          <Tooltip
            content="从已完成的 Sora-2 视频中提取角色后可在此选择"
            theme="light"
            showArrow={false}
          >
            <InfoCircleIcon style={{ marginLeft: 4, cursor: 'help' }} />
          </Tooltip>
        </div>
        <div className="character-selector__empty">暂无可用角色</div>
      </div>
    );
  }

  return (
    <div className="character-selector">
      <div className="character-selector__label">
        <UserIcon style={{ marginRight: 4 }} />
        角色
        <span className="character-selector__hint">
          (选中后会自动添加到提示词)
        </span>
      </div>

      <div className="character-selector__chips">
        {visibleCharacters.map((character) => (
          <Tooltip
            key={character.id}
            content={character.sourcePrompt || `@${character.username}`}
            theme="light"
            showArrow={false}
          >
            <div
              className={`character-selector__chip ${selectedIds.includes(character.id) ? 'character-selector__chip--selected' : ''}`}
              onClick={() => handleCharacterClick(character)}
              data-track="character_click_select"
            >
              <div className="character-selector__chip-avatar">
                {character.profilePictureUrl ? (
                  <img src={character.profilePictureUrl} alt={character.username} />
                ) : (
                  <UserIcon />
                )}
              </div>
              <span>@{character.username}</span>
            </div>
          </Tooltip>
        ))}

        {hasMore && (
          <Tooltip
            content={`还有 ${completedCharacters.length - maxVisible} 个角色`}
            theme="light"
            showArrow={false}
          >
            <div className="character-selector__chip">
              +{completedCharacters.length - maxVisible}
            </div>
          </Tooltip>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          已选择: {getSelectedUsernames()}
        </div>
      )}
    </div>
  );
};

export default CharacterSelector;
