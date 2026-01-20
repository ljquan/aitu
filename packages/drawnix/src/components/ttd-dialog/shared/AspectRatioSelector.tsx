import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Tooltip } from 'tdesign-react';
import { ChevronDownIcon } from 'tdesign-icons-react';
import {
  ASPECT_RATIO_OPTIONS,
  AspectRatioOption,
  getAspectRatioOption,
  AUTO_ASPECT_RATIO
} from '../../../constants/image-aspect-ratios';
import { useI18n } from '../../../i18n';
import './AspectRatioSelector.scss';

export interface AspectRatioSelectorProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

/**
 * 图片宽高比选择器组件
 */
export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  value,
  onChange,
  compact = true
}) => {
  const { language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => {
    if (value === 'auto') return AUTO_ASPECT_RATIO;
    return getAspectRatioOption(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (option: AspectRatioOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  if (compact) {
    return (
      <div className="aspect-ratio-selector aspect-ratio-selector--compact" ref={containerRef}>
        <Tooltip content={language === 'zh' ? '选择图片比例' : 'Select aspect ratio'} theme="light">
          <div
            className={`aspect-ratio-selector__trigger ${isOpen ? 'aspect-ratio-selector__trigger--open' : ''}`}
            data-track="ai_click_ratio_toggle"
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className="aspect-ratio-selector__trigger-value">
              {selectedOption?.label || value}
            </span>
            <ChevronDownIcon className={`aspect-ratio-selector__trigger-icon ${isOpen ? 'aspect-ratio-selector__trigger-icon--open' : ''}`} />
          </div>
        </Tooltip>

        {isOpen && (
          <div className="aspect-ratio-selector__dropdown">
            <div className="aspect-ratio-selector__dropdown-grid">
              {ASPECT_RATIO_OPTIONS.map((option) => (
                <Tooltip
                  key={option.value}
                  content={option.description}
                  theme="light"
                  placement="top"
                >
                  <div
                    className={`aspect-ratio-selector__dropdown-item ${
                      value === option.value ? 'aspect-ratio-selector__dropdown-item--selected' : ''
                    }`}
                    data-track="ai_click_ratio_select"
                    onClick={() => handleSelect(option)}
                  >
                    {option.label}
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Non-compact mode (original layout)
  return (
    <div className="aspect-ratio-selector">
      <div className="aspect-ratio-selector__label">
        {language === 'zh' ? '图片比例' : 'Aspect Ratio'}
      </div>

      <div className="aspect-ratio-selector__options">
        {ASPECT_RATIO_OPTIONS.map((option) => (
          <Tooltip
            key={option.value}
            content={option.description}
            theme="light"
            placement="top"
          >
            <div
              className={`aspect-ratio-selector__option ${
                value === option.value ? 'aspect-ratio-selector__option--selected' : ''
              }`}
              data-track="ai_click_ratio_select"
              onClick={() => onChange(option.value)}
            >
              <span className="aspect-ratio-selector__option-ratio">
                {option.label}
              </span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

export default AspectRatioSelector;
