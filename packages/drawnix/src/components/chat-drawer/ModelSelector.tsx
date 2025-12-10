/**
 * ModelSelector Component
 *
 * A modern dropdown component for selecting the chat model.
 * Features: search, grouping by provider, and badges.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { settingsManager } from '../../utils/settings-manager';
import { ProviderIcon } from './ProviderIcon';

export interface ModelSelectorProps {
  className?: string;
  onChange?: (modelId: string) => void;
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
  ({ className, onChange }) => {
    const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL_ID);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Load saved model from settings
    useEffect(() => {
      const loadModel = async () => {
        await settingsManager.waitForInitialization();
        const savedModel = settingsManager.getSetting<string>('gemini.chatModel');
        if (savedModel && getChatModelById(savedModel)) {
          setSelectedModel(savedModel);
        }
      };
      loadModel();
    }, []);

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

    // Handle model selection
    const handleSelectModel = useCallback(
      async (modelId: string) => {
        setSelectedModel(modelId);
        await settingsManager.updateSetting('gemini.chatModel', modelId);
        onChange?.(modelId);
        setIsOpen(false);
        setSearchQuery('');
      },
      [onChange]
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

    return (
      <div className={`model-selector ${className || ''}`}>
        <button
          ref={triggerRef}
          className={`model-selector__trigger ${isOpen ? 'model-selector__trigger--active' : ''}`}
          data-track="chat_click_model_selector"
          onClick={handleToggle}
          aria-label="选择模型"
          aria-expanded={isOpen}
        >
          {currentModel && (
            <ProviderIcon provider={currentModel.provider} className="model-selector__trigger-icon-provider" />
          )}
          <span className="model-selector__trigger-text">
            {currentModel?.name || '选择模型'}
          </span>
          <ChevronDownIcon
            size={16}
            className={`model-selector__trigger-icon ${isOpen ? 'model-selector__trigger-icon--open' : ''}`}
          />
        </button>

        {isOpen && (
          <div ref={dropdownRef} className="model-selector__dropdown">
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
                            {model.badges && model.badges.length > 0 && (
                              <div className="model-selector__badges">
                                {model.badges.map((badge) => (
                                  <span
                                    key={badge}
                                    className={`model-selector__badge ${BADGE_COLORS[badge]}`}
                                  >
                                    {badge}
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
        )}
      </div>
    );
  }
);

ModelSelector.displayName = 'ModelSelector';
