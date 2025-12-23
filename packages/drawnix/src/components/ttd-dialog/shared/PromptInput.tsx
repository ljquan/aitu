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
    showBelow: boolean; // Whether to show popup below cursor
    startIndex: number; // Position of @ in the prompt
    selectedIndex: number;
  }>({
    visible: false,
    query: '',
    position: { top: 0, left: 0 },
    showBelow: false,
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

  // Calculate mention popup position using mirror div technique
  const calculateMentionPosition = useCallback((cursorIndex: number) => {
    if (!textareaRef.current) return { top: 0, left: 0, showBelow: false };

    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();

    // Create a mirror div that matches textarea styling
    const mirror = document.createElement('div');
    const computedStyle = window.getComputedStyle(textarea);

    // Copy relevant styles to mirror
    const stylesToCopy = [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
      'letterSpacing', 'lineHeight', 'textTransform',
      'wordSpacing', 'whiteSpace',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'boxSizing',
    ];

    mirror.style.position = 'absolute';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.overflow = 'hidden';
    mirror.style.width = `${textarea.clientWidth}px`;

    stylesToCopy.forEach(style => {
      (mirror.style as any)[style] = computedStyle.getPropertyValue(
        style.replace(/([A-Z])/g, '-$1').toLowerCase()
      );
    });

    document.body.appendChild(mirror);

    // Get text before cursor
    const textBeforeCursor = textarea.value.substring(0, cursorIndex);

    // Create content with cursor marker
    const textNode = document.createTextNode(textBeforeCursor);
    const cursorSpan = document.createElement('span');
    cursorSpan.textContent = '\u200B'; // Zero-width space as cursor marker

    mirror.appendChild(textNode);
    mirror.appendChild(cursorSpan);

    // Get cursor position
    const cursorRect = cursorSpan.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    // Calculate offset within textarea
    const cursorOffsetTop = cursorRect.top - mirrorRect.top;
    const cursorOffsetLeft = cursorRect.left - mirrorRect.left;

    // Clean up
    document.body.removeChild(mirror);

    // Account for textarea scroll and get line height
    const scrollTop = textarea.scrollTop;
    const lineHeight = parseInt(computedStyle.lineHeight) || 20;

    // Calculate position relative to viewport
    let top = rect.top + cursorOffsetTop - scrollTop;
    let left = rect.left + cursorOffsetLeft;

    // Ensure popup doesn't go off-screen horizontally
    const popupWidth = 240;
    const viewportWidth = window.innerWidth;
    if (left + popupWidth > viewportWidth - 16) {
      left = viewportWidth - popupWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    // Check if there's enough space above for the popup
    const popupHeight = 220;
    const showBelow = top < popupHeight + 16;

    if (showBelow) {
      // Show below cursor - add line height to position below current line
      top = top + lineHeight + 4;
    } else {
      // Show above cursor - move up a bit more for better visual spacing
      top = top - 48;
    }

    return { top, left, showBelow };
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
    const positionResult = calculateMentionPosition(cursorPos);
    setMentionState({
      visible: true,
      query,
      position: { top: positionResult.top, left: positionResult.left },
      showBelow: positionResult.showBelow,
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
          showBelow={mentionState.showBelow}
          selectedIndex={mentionState.selectedIndex}
          onSelect={handleCharacterSelect}
          onClose={() => setMentionState(prev => ({ ...prev, visible: false }))}
        />
      )}
    </div>
  );
};