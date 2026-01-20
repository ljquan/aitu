import React, { useState, useRef, useEffect } from 'react';
import { Button, Tooltip } from 'tdesign-react';
import { RefreshIcon, ChevronDownIcon } from 'tdesign-icons-react';

interface ActionButtonsProps {
  language: 'zh' | 'en';
  type: 'image' | 'video';
  isGenerating: boolean;
  hasGenerated: boolean;
  canGenerate: boolean;
  onGenerate: (count?: number) => void;
  onReset: () => void;
  leftContent?: React.ReactNode;
}

const PRESETS = [1, 2, 3, 4, 5, 10, 20, 50, 100];
const IMAGE_STORAGE_KEY = 'aitu_image_generation_quantity';
const VIDEO_STORAGE_KEY = 'aitu_video_generation_quantity';
const MAX_QUANTITY = 100;

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  language,
  type,
  isGenerating,
  hasGenerated,
  canGenerate,
  onGenerate,
  onReset,
  leftContent
}) => {
  // Get type-specific storage key
  const storageKey = type === 'video' ? VIDEO_STORAGE_KEY : IMAGE_STORAGE_KEY;

  // Initialize from localStorage
  const [quantity, setQuantity] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 1 && num <= MAX_QUANTITY) {
          return num;
        }
      }
    } catch (e) {
      // localStorage not available
    }
    return 1;
  });
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(() => quantity.toString());
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal input state when quantity changes
  useEffect(() => {
    setInputValue(quantity.toString());
    // Save to localStorage
    try {
      localStorage.setItem(storageKey, quantity.toString());
    } catch (e) {
      // localStorage not available
    }
  }, [quantity, storageKey]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        handleBlur();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue]);

  const handleBlur = () => {
    let num = parseInt(inputValue, 10);
    if (isNaN(num) || num < 1) num = 1;
    if (num > MAX_QUANTITY) num = MAX_QUANTITY;

    setInputValue(num.toString());
    setQuantity(num);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*$/.test(val)) {
      setInputValue(val);
    }
  };

  const handleSelect = (preset: number) => {
    setQuantity(preset);
    setInputValue(preset.toString());
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    if (!isGenerating) {
      setIsOpen(!isOpen);
    }
  };

  const handleGenerateClick = () => {
    onGenerate(quantity);
  };

  return (
    <div className="section-actions unified-action-bar">
      {/* Left Content (e.g., AspectRatioSelector) */}
      {leftContent && <div className="action-bar-left">{leftContent}</div>}

      {/* Unified Action Box Container - For both image and video types */}
      <div className={`unified-action-box ${isGenerating ? 'is-generating' : ''} ${canGenerate ? 'can-generate' : ''}`}>
        {/* Left Side: Quantity Control */}
        <div className="quantity-section" ref={containerRef}>
          <Tooltip content={language === 'zh' ? '生成数量' : 'Quantity'} theme="light">
            <div className={`quantity-control ${isOpen ? 'is-open' : ''} ${isGenerating ? 'is-disabled' : ''}`}>
              <input
                type="text"
                inputMode="numeric"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                data-track="ai_click_quantity_input"
                onClick={() => !isGenerating && setIsOpen(true)}
                disabled={isGenerating}
                className="quantity-input"
              />
              <button
                type="button"
                data-track="ai_click_quantity_toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown();
                }}
                disabled={isGenerating}
                className="quantity-toggle"
              >
                <ChevronDownIcon
                  className={`quantity-icon ${isOpen ? 'is-open' : ''}`}
                />
              </button>
            </div>
          </Tooltip>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="quantity-dropdown">
              <div className="quantity-dropdown-header">
                {language === 'zh' ? '选择数量' : 'Select Quantity'}
              </div>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-track="ai_click_quantity_select"
                  onClick={() => handleSelect(preset)}
                  className={`quantity-option ${quantity === preset ? 'is-selected' : ''}`}
                >
                  <span>
                    {preset} {type === 'video'
                      ? (language === 'zh' ? '个' : (preset > 1 ? 'videos' : 'video'))
                      : (language === 'zh' ? '张' : (preset > 1 ? 'images' : 'image'))
                    }
                  </span>
                  {quantity === preset && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Middle: Vertical Divider */}
        <div className="action-divider"></div>

        {/* Right Side: Generate Button */}
        <button
          data-track="ai_click_generate"
          onClick={handleGenerateClick}
          disabled={isGenerating || !canGenerate}
          className={`generate-button ${isGenerating ? 'loading' : ''}`}
        >
          {isGenerating
            ? (language === 'zh' ? '生成中...' : 'Generating...')
            : hasGenerated
            ? (language === 'zh' ? '重新生成' : 'Regenerate')
            : type === 'video'
            ? (language === 'zh' ? '生成视频' : 'Generate Video')
            : (language === 'zh' ? '生成' : 'Generate')}
        </button>
      </div>

      {/* Reset Button - Subtle icon-only version */}
      <Tooltip content={language === 'zh' ? '重置表单' : 'Reset form'} theme="light">
        <Button
          data-track="ai_click_reset"
          onClick={onReset}
          disabled={isGenerating}
          variant="text"
          shape="circle"
          icon={<RefreshIcon />}
          className="action-button--reset-subtle"
        />
      </Tooltip>
    </div>
  );
};
