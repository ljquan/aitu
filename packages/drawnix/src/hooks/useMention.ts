/**
 * useMention Hook
 *
 * Reusable hook for @ mention functionality in textarea inputs.
 * Handles mention detection, popup positioning, keyboard navigation, and character selection.
 */

import { useState, useCallback, useRef, RefObject } from 'react';
import { useCharacters } from './useCharacters';
import type { SoraCharacter } from '../types/character.types';

export interface MentionState {
  visible: boolean;
  query: string;
  position: { top: number; left: number };
  showBelow: boolean;
  startIndex: number;
  selectedIndex: number;
}

export interface UseMentionOptions {
  /** Whether mention feature is enabled */
  enabled?: boolean;
  /** Callback when prompt value changes */
  onPromptChange: (value: string) => void;
  /** Current prompt value */
  prompt: string;
}

export interface UseMentionReturn {
  /** Current mention state */
  mentionState: MentionState;
  /** Set mention state */
  setMentionState: React.Dispatch<React.SetStateAction<MentionState>>;
  /** Ref to attach to textarea */
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** Completed characters list */
  completedCharacters: SoraCharacter[];
  /** Handle text change with mention detection */
  handleTextChange: (value: string, cursorPos: number) => void;
  /** Handle keyboard navigation */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Handle character selection */
  handleCharacterSelect: (character: SoraCharacter) => void;
  /** Close mention popup */
  closeMentionPopup: () => void;
  /** Calculate mention position for a given cursor index */
  calculateMentionPosition: (cursorIndex: number) => { top: number; left: number; showBelow: boolean };
}

const initialMentionState: MentionState = {
  visible: false,
  query: '',
  position: { top: 0, left: 0 },
  showBelow: false,
  startIndex: -1,
  selectedIndex: 0,
};

/**
 * useMention - Hook for @ mention functionality
 */
export function useMention({
  enabled = true,
  onPromptChange,
  prompt,
}: UseMentionOptions): UseMentionReturn {
  const [mentionState, setMentionState] = useState<MentionState>(initialMentionState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { completedCharacters } = useCharacters();

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
    if (!enabled) {
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
  }, [enabled, calculateMentionPosition]);

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
  const handleTextChange = useCallback((value: string, cursorPos: number) => {
    onPromptChange(value);
    handleMentionDetection(value, cursorPos);
  }, [onPromptChange, handleMentionDetection]);

  // Close mention popup
  const closeMentionPopup = useCallback(() => {
    setMentionState(prev => ({ ...prev, visible: false }));
  }, []);

  return {
    mentionState,
    setMentionState,
    textareaRef,
    completedCharacters,
    handleTextChange,
    handleKeyDown,
    handleCharacterSelect,
    closeMentionPopup,
    calculateMentionPosition,
  };
}

export default useMention;
