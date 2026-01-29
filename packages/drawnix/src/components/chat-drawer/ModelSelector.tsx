/**
 * ModelSelector Component
 *
 * A modern dropdown component for selecting the chat model.
 * Features: search, grouping by provider, and badges.
 * 
 * Note: This selector manages a temporary/session-level model selection
 * that does NOT affect global settings. The global text model is configured
 * in the settings dialog.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Input } from 'tdesign-react';
import { ChevronDownIcon, SearchIcon } from 'tdesign-icons-react';
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModelById,
  getModelsByProvider,
  ModelProvider,
  PROVIDER_NAMES,
  type ChatModel,
  type ModelBadge,
} from '../../constants/CHAT_MODELS';
import { ProviderIcon } from './ProviderIcon';
import { ModelHealthBadge } from '../shared/ModelHealthBadge';
import { Z_INDEX } from '../../constants/z-index';

export interface ModelSelectorProps {
  className?: string;
  /** Current selected model ID (controlled mode) */
  value?: string;
  /** Callback when model changes - does NOT save to global settings */
  onChange?: (modelId: string) => void;
  /** Display variant: 'capsule' (default for chat drawer) or 'form' (for settings) */
  variant?: 'capsule' | 'form';
}

/** Badge color mapping */
const BADGE_COLORS: Record<ModelBadge, string> = {
  NEW: 'badge-new',
  Fast: 'badge-fast',
  Multimodal: 'badge-multimodal',
  Reasoning: 'badge-reasoning',
  Pro: 'badge-pro',
  Economic: 'badge-economic',
};

export const ModelSelector: React.FC<ModelSelectorProps> = React.memo(
  ({ className, value, onChange, variant = 'capsule' }) => {
    // Use controlled value if provided, otherwise use internal state
    const [internalModel, setInternalModel] = useState<string>(DEFAULT_CHAT_MODEL_ID);
    const selectedModel = value ?? internalModel;
    
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(target) &&
          triggerRef.current &&
          !triggerRef.current.contains(target)
        ) {
          setIsOpen(false);
          setSearchQuery('');
        }
      };

      // Small delay to avoid immediate closing
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen]);

    // Handle model selection - only updates local state, does NOT save to global settings
    const handleSelectModel = useCallback(
      (modelId: string) => {
        if (value === undefined) {
          // Uncontrolled mode: update internal state
          setInternalModel(modelId);
        }
        // Always notify parent
        onChange?.(modelId);
        setIsOpen(false);
        setSearchQuery('');
      },
      [value, onChange]
    );

    // Toggle dropdown
    const handleToggle = useCallback(() => {
      setIsOpen((prev) => !prev);
      if (isOpen) {
        setSearchQuery('');
      }
    }, [isOpen]);

    // Filter models based on search query
    const filteredModels = useMemo(() => {
      if (!searchQuery.trim()) {
        return CHAT_MODELS;
      }

      const query = searchQuery.toLowerCase();
      return CHAT_MODELS.filter(
        (model) =>
          model.name.toLowerCase().includes(query) ||
          model.description.toLowerCase().includes(query) ||
          PROVIDER_NAMES[model.provider].toLowerCase().includes(query)
      );
    }, [searchQuery]);

    // Group filtered models by provider
    const groupedModels = useMemo(() => {
      const grouped: Record<ModelProvider, ChatModel[]> = {
        [ModelProvider.OPENAI]: [],
        [ModelProvider.ANTHROPIC]: [],
        [ModelProvider.DEEPSEEK]: [],
        [ModelProvider.GOOGLE]: [],
      };

      filteredModels.forEach((model) => {
        grouped[model.provider].push(model);
      });

      // Filter out empty groups
      return Object.entries(grouped).filter(([_, models]) => models.length > 0);
    }, [filteredModels]);

    const currentModel = getChatModelById(selectedModel);

    const [portalPosition, setPortalPosition] = useState({ top: 0, left: 0, width: 0, bottom: 0 });

    useLayoutEffect(() => {
      if (isOpen) {
        const updatePosition = () => {
          if (!triggerRef.current) return;
          const rect = triggerRef.current.getBoundingClientRect();
          setPortalPosition({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            bottom: rect.bottom
          });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
          window.removeEventListener('resize', updatePosition);
          window.removeEventListener('scroll', updatePosition, true);
        };
      }
    }, [isOpen]);

    const renderMenu = () => {
      if (!isOpen) return null;

      const menu = (
        <div 
          ref={dropdownRef} 
          className="model-selector__dropdown"
          style={{
            position: 'fixed',
            zIndex: Z_INDEX.DROPDOWN_PORTAL,
            left: portalPosition.left,
            top: portalPosition.bottom + 8,
            minWidth: 360,
            width: variant === 'form' ? portalPosition.width : 'auto',
            visibility: portalPosition.width === 0 ? 'hidden' : 'visible',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="model-selector__search">
            <Input
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索模型..."
              prefixIcon={<SearchIcon />}
              clearable
              autofocus
            />
          </div>

          {/* Model list */}
          <div className="model-selector__list">
            {groupedModels.length === 0 ? (
              <div className="model-selector__empty">未找到匹配的模型</div>
            ) : (
              groupedModels.map(([provider, models]) => (
                <div key={provider} className="model-selector__group">
                  <div className="model-selector__group-header">
                    {PROVIDER_NAMES[provider as ModelProvider]}
                  </div>
                  {models.map((model) => (
                    <button
                      key={model.id}
                      className={`model-selector__item ${
                        model.id === selectedModel
                          ? 'model-selector__item--active'
                          : ''
                      }`}
                      data-track="chat_click_model_select"
                      onClick={() => handleSelectModel(model.id)}
                    >
                      <ProviderIcon
                        provider={model.provider}
                        className="model-selector__item-icon"
                      />
                      <div className="model-selector__item-content">
                        <div className="model-selector__item-header">
                          <span className="model-selector__item-name">
                            {model.name}
                          </span>
                          <ModelHealthBadge modelId={model.id} />
                          {model.badges && model.badges.length > 0 && (
                            <div className="model-selector__badges">
                                {model.badges.map((badge) => (
                                  <span
                                    key={badge}
                                    className={`model-selector__badge ${BADGE_COLORS[badge]}`}
                                  >
                                    {badge === 'NEW' ? 'VIP' : badge}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                        <div className="model-selector__item-desc">
                          {model.description}
                        </div>
                      </div>
                      {model.id === selectedModel && (
                        <svg
                          className="model-selector__check"
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M13.3334 4L6.00002 11.3333L2.66669 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      );

      return createPortal(menu, document.body);
    };

    return (
      <div className={`model-selector ${className || ''} model-selector--variant-${variant}`}>
        <button
          ref={triggerRef}
          className={`model-selector__trigger ${isOpen ? 'model-selector__trigger--active' : ''}`}
          data-track="chat_click_model_selector"
          onClick={handleToggle}
          aria-label="选择模型"
          aria-expanded={isOpen}
        >
          <div className="model-selector__trigger-content">
            <ModelHealthBadge modelId={selectedModel} className="model-selector__trigger-health" />
            <span className="model-selector__trigger-text">
              {currentModel?.name || '选择模型'}
            </span>
          </div>
          <ChevronDownIcon
            size={16}
            className={`model-selector__trigger-icon ${isOpen ? 'model-selector__trigger-icon--open' : ''}`}
          />
        </button>

        {renderMenu()}
      </div>
    );
  }
);

ModelSelector.displayName = 'ModelSelector';
