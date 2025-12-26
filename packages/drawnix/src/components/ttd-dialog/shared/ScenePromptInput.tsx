/**
 * ScenePromptInput Component
 *
 * Textarea input for scene prompts with @ mention support.
 * Used in StoryboardEditor for individual scene prompt editing.
 */

import React, { useCallback, useEffect } from 'react';
import { CharacterMentionPopup } from '../../character/CharacterMentionPopup';
import { useMention } from '../../../hooks/useMention';

interface ScenePromptInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Whether to enable @ mention feature */
  enableMention?: boolean;
}

export const ScenePromptInput: React.FC<ScenePromptInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  enableMention = true,
}) => {
  const {
    mentionState,
    textareaRef,
    handleTextChange,
    handleKeyDown,
    handleCharacterSelect,
    closeMentionPopup,
  } = useMention({
    enabled: enableMention,
    onPromptChange: onChange,
    prompt: value,
  });

  // Handle textarea change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    handleTextChange(newValue, cursorPos);
  }, [handleTextChange]);

  // Auto focus
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus, textareaRef]);

  return (
    <div className="scene-prompt-input">
      <textarea
        ref={textareaRef}
        className="scene-prompt-input__textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
      />

      {/* Character mention popup */}
      {enableMention && (
        <CharacterMentionPopup
          visible={mentionState.visible}
          query={mentionState.query}
          position={mentionState.position}
          showBelow={mentionState.showBelow}
          selectedIndex={mentionState.selectedIndex}
          onSelect={handleCharacterSelect}
          onClose={closeMentionPopup}
        />
      )}
    </div>
  );
};

export default ScenePromptInput;
