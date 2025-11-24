/**
 * GenerationCountSelector Component
 *
 * UI component for selecting the number of images/videos to generate.
 * Provides preset buttons (1/2/4) and custom number input.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { InputNumber, Tooltip } from 'tdesign-react';
import { GENERATION_COUNT } from '../../../constants/generation';
import './generation-count-selector.scss';

export interface GenerationCountSelectorProps {
  /** Current selected count */
  value: number;
  /** Callback when count changes */
  onChange: (count: number) => void;
  /** Language for labels */
  language: 'zh' | 'en';
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * Generation count selector with preset buttons and custom input
 */
export const GenerationCountSelector: React.FC<GenerationCountSelectorProps> = ({
  value,
  onChange,
  language,
  disabled = false
}) => {
  // Track if user is currently editing custom input
  const [isCustomInput, setIsCustomInput] = useState(false);
  const [inputValue, setInputValue] = useState<number | undefined>(value);

  // Check if current value is a preset
  const isPreset = (GENERATION_COUNT.PRESETS as readonly number[]).includes(value);

  // Update input value when external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Handle preset button click
  const handlePresetClick = useCallback((preset: number) => {
    setIsCustomInput(false);
    onChange(preset);
  }, [onChange]);

  // Handle custom input change
  const handleInputChange = useCallback((newValue: number | undefined) => {
    setInputValue(newValue);
    if (newValue !== undefined && !isNaN(newValue)) {
      setIsCustomInput(true);
      // Clamp to valid range
      const clampedValue = Math.max(
        GENERATION_COUNT.MIN,
        Math.min(GENERATION_COUNT.MAX, Math.round(newValue))
      );
      onChange(clampedValue);
    }
  }, [onChange]);

  // Labels based on language
  const labels = {
    title: language === 'zh' ? '生成数量' : 'Count',
    tooltip: language === 'zh'
      ? `选择生成数量 (${GENERATION_COUNT.MIN}-${GENERATION_COUNT.MAX})`
      : `Select generation count (${GENERATION_COUNT.MIN}-${GENERATION_COUNT.MAX})`
  };

  return (
    <div className="generation-count-selector">
      <Tooltip content={labels.tooltip} theme="light">
        <span className="generation-count-selector__label">{labels.title}</span>
      </Tooltip>

      <div className="generation-count-selector__controls">
        {/* Preset buttons */}
        <div className="generation-count-selector__presets">
          {GENERATION_COUNT.PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`generation-count-selector__preset-btn ${
                value === preset && !isCustomInput ? 'generation-count-selector__preset-btn--active' : ''
              }`}
              onClick={() => handlePresetClick(preset)}
              disabled={disabled}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div className="generation-count-selector__input">
          <InputNumber
            value={inputValue}
            onChange={handleInputChange}
            min={GENERATION_COUNT.MIN}
            max={GENERATION_COUNT.MAX}
            step={1}
            disabled={disabled}
            size="small"
            theme="normal"
          />
        </div>
      </div>
    </div>
  );
};

export default GenerationCountSelector;
