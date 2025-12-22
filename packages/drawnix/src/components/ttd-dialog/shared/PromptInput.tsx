import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getPromptExample } from './ai-generation-utils';
import { CharacterMentionPopup } from '../../character/CharacterMentionPopup';
import { useCharacters } from '../../../hooks/useCharacters';
import type { SoraCharacter } from '../../../types/character.types';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  presetPrompts: string[];
  language: 'zh' | 'en';
  type: 'image' | 'video';
  disabled?: boolean;
  onError?: (error: string | null) => void;
  /** Whether to enable character @ mention feature */
  enableMention?: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  prompt,
  onPromptChange,
  presetPrompts,
  language,
  type,
  disabled = false,
  onError,
  enableMention = true, // Enable by default for video
}) => {
  const [isPresetOpen, setIsPresetOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention state
  const [mentionState, setMentionState] = useState<{
    visible: boolean;
    query: string;
    position: { top: number; left: number };
    startIndex: number; // Position of @ in the prompt
    selectedIndex: number;
  }>({
    visible: false,
    query: '',
    position: { top: 0, left: 0 },
    startIndex: -1,
    selectedIndex: 0,
  });

  const { completedCharacters } = useCharacters();

  // 点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPresetOpen(false);
      }
    };

    if (isPresetOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPresetOpen]);

  const handlePresetClick = (preset: string) => {
    onPromptChange(preset);
    onError?.(null);
    setIsPresetOpen(false); // 点击提示词后关闭弹窗
  };

  // Calculate mention popup position - show above cursor using caret position
  const calculateMentionPosition = useCallback((cursorIndex: number) => {
    if (!textareaRef.current) return { top: 0, left: 0 };

    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();

    // Get text before cursor to calculate approximate position
    const textBeforeCursor = textarea.value.substring(0, cursorIndex);
    const lines = textBeforeCursor.split('\n');
    const currentLineIndex = lines.length - 1;
    const currentLineText = lines[currentLineIndex];

    // Approximate character width (monospace assumption ~8px per char)
    const charWidth = 8;
    const lineHeight = 20; // Approximate line height

    // Calculate x position based on current line length
    const xOffset = Math.min(currentLineText.length * charWidth, rect.width - 200);

    // Calculate y position based on line number (from top of textarea)
    const yOffset = currentLineIndex * lineHeight;

    // Position popup above the cursor line
    return {
      top: rect.top + yOffset - 8, // Above cursor, will use transform to move up
      left: rect.left + Math.max(0, xOffset),
    };
  }, []);

  // Handle @ mention detection
  const handleMentionDetection = useCallback((value: string, cursorPos: number) => {
    if (!enableMention || type !== 'video') {
      return;
    }

    // Find the last @ before cursor
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      setMentionState(prev => ({ ...prev, visible: false }));
      return;
    }

    // Check if @ is at the start or after a space
    const charBeforeAt = lastAtIndex > 0 ? value[lastAtIndex - 1] : ' ';
    if (!/\s/.test(charBeforeAt) && lastAtIndex !== 0) {
      setMentionState(prev => ({ ...prev, visible: false }));
      return;
    }

    // Get query after @
    const query = textBeforeCursor.substring(lastAtIndex + 1);

    // Check if query contains space (mention ended)
    if (query.includes(' ')) {
      setMentionState(prev => ({ ...prev, visible: false }));
      return;
    }

    // Show mention popup
    setMentionState({
      visible: true,
      query,
      position: calculateMentionPosition(cursorPos),
      startIndex: lastAtIndex,
      selectedIndex: 0,
    });
  }, [enableMention, type, calculateMentionPosition]);

  // Handle character selection
  const handleCharacterSelect = useCallback((character: SoraCharacter) => {
    if (mentionState.startIndex === -1) return;

    const beforeMention = prompt.substring(0, mentionState.startIndex);
    const cursorPos = textareaRef.current?.selectionStart || prompt.length;
    const afterMention = prompt.substring(cursorPos);

    // Replace @query with @username
    const newPrompt = `${beforeMention}@${character.username} ${afterMention}`;
    onPromptChange(newPrompt);

    // Close mention popup
    setMentionState(prev => ({ ...prev, visible: false }));

    // Focus textarea and set cursor after the inserted username
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + character.username.length + 2; // +2 for @ and space
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [mentionState.startIndex, prompt, onPromptChange]);

  // Handle keyboard navigation in mention popup
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionState.visible) return;

    // Filter characters by query for navigation
    const filteredCharacters = mentionState.query
      ? completedCharacters.filter(c =>
          c.username.toLowerCase().includes(mentionState.query.toLowerCase())
        )
      : completedCharacters;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setMentionState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, filteredCharacters.length - 1),
        }));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setMentionState(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
        break;
      case 'Enter':
      case 'Tab':
        if (filteredCharacters.length > 0) {
          e.preventDefault();
          handleCharacterSelect(filteredCharacters[mentionState.selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setMentionState(prev => ({ ...prev, visible: false }));
        break;
    }
  }, [mentionState, completedCharacters, handleCharacterSelect]);

  // Handle text change with mention detection
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    onPromptChange(value);
    onError?.(null);

    // Detect @ mentions
    handleMentionDetection(value, cursorPos);
  }, [onPromptChange, onError, handleMentionDetection]);

  // Close mention popup when type changes
  useEffect(() => {
    if (type !== 'video') {
      setMentionState(prev => ({ ...prev, visible: false }));
    }
  }, [type]);

  return (
    <div className="form-field">
      <div className="form-label-with-icon">
      <label className="form-label">
        {language === 'zh' ? `${type === 'image' ? '图像' : '视频'}描述` : `${type === 'image' ? 'Image' : 'Video'} Description`}
      </label>
      <div className="textarea-with-preset">
        <div className="preset-tooltip-container" ref={containerRef}>
          <button
            type="button"
            className="preset-icon-button"
            disabled={disabled}
            onClick={() => setIsPresetOpen(!isPresetOpen)}
          >
            💡
          </button>
          {isPresetOpen && (
            <div className="preset-tooltip">
              <div className="preset-header">
                {language === 'zh' ? '预设提示词' : 'Preset Prompts'}
              </div>
              <div className="preset-list">
                {presetPrompts.map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    className="preset-item"
                    data-track="ai_click_prompt_preset"
                    onClick={() => handlePresetClick(preset)}
                    disabled={disabled}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="form-textarea"
        value={prompt}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={getPromptExample(language, type)}
        rows={4}
        disabled={disabled}
      />

      {/* Character mention popup - rendered in portal style with fixed position */}
      {enableMention && type === 'video' && (
        <CharacterMentionPopup
          visible={mentionState.visible}
          query={mentionState.query}
          position={mentionState.position}
          selectedIndex={mentionState.selectedIndex}
          onSelect={handleCharacterSelect}
          onClose={() => setMentionState(prev => ({ ...prev, visible: false }))}
        />
      )}
    </div>
  );
};