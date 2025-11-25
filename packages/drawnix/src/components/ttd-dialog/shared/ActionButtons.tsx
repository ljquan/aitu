import React, { useState, useRef, useEffect } from 'react';

interface ActionButtonsProps {
  language: 'zh' | 'en';
  type: 'image' | 'video';
  isGenerating: boolean;
  hasGenerated: boolean;
  canGenerate: boolean;
  onGenerate: (count?: number) => void;
  onReset: () => void;
}

const PRESETS = [1, 2, 3, 4, 5, 10, 20, 50, 100];
const STORAGE_KEY = 'aitu_image_generation_quantity';

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  language,
  type,
  isGenerating,
  hasGenerated,
  canGenerate,
  onGenerate,
  onReset
}) => {
  // Initialize from localStorage
  const [quantity, setQuantity] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 1 && num <= 100) {
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
      localStorage.setItem(STORAGE_KEY, quantity.toString());
    } catch (e) {
      // localStorage not available
    }
  }, [quantity]);

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
    if (num > 100) num = 100;

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
      {/* Unified Action Box Container - Only for image type */}
      {type === 'image' ? (
        <div className={`unified-action-box ${isGenerating ? 'is-generating' : ''} ${canGenerate ? 'can-generate' : ''}`}>
          {/* Left Side: Quantity Control */}
          <div className="quantity-section" ref={containerRef}>
            <span className="quantity-label">
              {language === 'zh' ? '数量' : 'Count'}
            </span>
            <div className={`quantity-control ${isOpen ? 'is-open' : ''} ${isGenerating ? 'is-disabled' : ''}`}>
              <input
                type="text"
                inputMode="numeric"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onClick={() => !isGenerating && setIsOpen(true)}
                disabled={isGenerating}
                className="quantity-input"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown();
                }}
                disabled={isGenerating}
                className="quantity-toggle"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`quantity-icon ${isOpen ? 'is-open' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>

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
                    onClick={() => handleSelect(preset)}
                    className={`quantity-option ${quantity === preset ? 'is-selected' : ''}`}
                  >
                    <span>{preset} {language === 'zh' ? '张' : (preset > 1 ? 'images' : 'image')}</span>
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
            onClick={handleGenerateClick}
            disabled={isGenerating || !canGenerate}
            className={`generate-button ${isGenerating ? 'loading' : ''}`}
          >
            {isGenerating
              ? (language === 'zh' ? '生成中...' : 'Generating...')
              : hasGenerated
              ? (language === 'zh' ? '重新生成' : 'Regenerate')
              : (language === 'zh' ? '生成' : 'Generate')}
          </button>
        </div>
      ) : (
        /* Video type - simple button without quantity */
        <button
          onClick={() => onGenerate(1)}
          disabled={isGenerating || !canGenerate}
          className={`action-button primary ${isGenerating ? 'loading' : ''}`}
        >
          {isGenerating
            ? (language === 'zh' ? '生成中...' : 'Generating...')
            : hasGenerated
            ? (language === 'zh' ? '重新生成' : 'Regenerate')
            : (language === 'zh' ? '生成视频' : 'Generate Video')}
        </button>
      )}

      {/* Reset Button */}
      <button
        onClick={onReset}
        disabled={isGenerating}
        className="action-button secondary"
      >
        {language === 'zh' ? '重置' : 'Reset'}
      </button>
    </div>
  );
};
