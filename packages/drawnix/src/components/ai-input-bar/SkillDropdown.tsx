import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Zap, Plus } from 'lucide-react';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { Z_INDEX } from '../../constants/z-index';
import { SYSTEM_SKILLS, SKILL_AUTO_ID } from '../../constants/skills';
import { knowledgeBaseService } from '../../services/knowledge-base-service';
import type { KBNoteMeta } from '../../types/knowledge-base.types';
import { KeyboardDropdown } from './KeyboardDropdown';

export interface SkillDropdownProps {
  value: string;
  onSelect: (skillId: string) => void;
  onAddSkill: () => void;
  disabled?: boolean;
}

/** 下拉选项类型 */
interface SkillOption {
  id: string;
  name: string;
  isSystem?: boolean;
}

/** 自动选项 */
const AUTO_OPTION: SkillOption = { id: SKILL_AUTO_ID, name: '自动' };

/** 系统内置 Skill 选项 */
const SYSTEM_OPTIONS: SkillOption[] = SYSTEM_SKILLS.map((s) => ({
  id: s.id,
  name: s.name,
  isSystem: true,
}));

export const SkillDropdown: React.FC<SkillDropdownProps> = ({
  value,
  onSelect,
  onAddSkill,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [userSkills, setUserSkills] = useState<SkillOption[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  /** 加载用户自定义 Skill（从知识库 Skill 目录读取） */
  const loadUserSkills = useCallback(async () => {
    try {
      const dirs = await knowledgeBaseService.getAllDirectories();
      const skillDir = dirs.find((d) => d.name === 'Skill');
      if (!skillDir) return;

      const notes = await knowledgeBaseService.getNoteMetasByDirectory(skillDir.id);
      // 排除与系统内置 Skill 同名的笔记（系统 Skill 以 ID 区分）
      const systemIds = new Set(SYSTEM_SKILLS.map((s) => s.id));
      const userOptions: SkillOption[] = notes
        .filter((n: KBNoteMeta) => !systemIds.has(n.id))
        .map((n: KBNoteMeta) => ({ id: n.id, name: n.title }));
      setUserSkills(userOptions);
    } catch {
      // 静默失败
    }
  }, []);

  // 打开时加载用户 Skill 并重置高亮
  useEffect(() => {
    if (isOpen) {
      loadUserSkills();
      const allOptions = [AUTO_OPTION, ...SYSTEM_OPTIONS, ...userSkills];
      const currentIndex = allOptions.findIndex((opt) => opt.id === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, value]);

  // 确保高亮项可见
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (disabled) return;
      setIsOpen((prev) => !prev);
    },
    [disabled]
  );

  const handleSelect = useCallback(
    (skillId: string) => {
      onSelect(skillId);
      setIsOpen(false);
    },
    [onSelect]
  );

  const handleAddSkill = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOpen(false);
      onAddSkill();
    },
    [onAddSkill]
  );

  const allOptions = [AUTO_OPTION, ...SYSTEM_OPTIONS, ...userSkills];

  const handleOpenKey = useCallback(
    (key: string) => {
      if (key === 'Escape') {
        setIsOpen(false);
        return true;
      }
      if (key === 'ArrowDown') {
        setHighlightedIndex((prev) => (prev < allOptions.length - 1 ? prev + 1 : 0));
        return true;
      }
      if (key === 'ArrowUp') {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : allOptions.length - 1));
        return true;
      }
      if (key === 'Enter' || key === ' ' || key === 'Tab') {
        if (highlightedIndex < allOptions.length) {
          handleSelect(allOptions[highlightedIndex].id);
        }
        return true;
      }
      return false;
    },
    [highlightedIndex, allOptions, handleSelect]
  );

  const selectedOption =
    allOptions.find((opt) => opt.id === value) || AUTO_OPTION;

  return (
    <KeyboardDropdown
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      disabled={disabled}
      openKeys={['Enter', ' ', 'ArrowDown', 'ArrowUp']}
      onOpenKey={handleOpenKey}
    >
      {({ containerRef, menuRef, portalPosition, handleTriggerKeyDown }) => (
        <div className="skill-dropdown" ref={containerRef}>
          <button
            className={`skill-dropdown__trigger ${isOpen ? 'skill-dropdown__trigger--open' : ''}`}
            onMouseDown={handleToggle}
            onKeyDown={handleTriggerKeyDown}
            disabled={disabled}
            type="button"
            title={`Skill: ${selectedOption.name}`}
          >
            <span className="skill-dropdown__icon-prefix">
              <Zap size={14} />
            </span>
            <span className="skill-dropdown__label">{selectedOption.name}</span>
            <ChevronDown
              size={14}
              className={`skill-dropdown__chevron ${isOpen ? 'skill-dropdown__chevron--open' : ''}`}
            />
          </button>
          {isOpen &&
            createPortal(
              <div
                ref={menuRef}
                className={`skill-dropdown__menu ${ATTACHED_ELEMENT_CLASS_NAME}`}
                style={{
                  position: 'fixed',
                  zIndex: Z_INDEX.DROPDOWN_PORTAL,
                  left: portalPosition.left,
                  bottom: window.innerHeight - portalPosition.top + 8,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="skill-dropdown__header">
                  <Zap size={14} />
                  <span>Skill</span>
                </div>
                <div ref={listRef} className="skill-dropdown__list">
                  {allOptions.map((option, index) => {
                    const isSelected = option.id === value;
                    const isHighlighted = index === highlightedIndex;
                    return (
                      <div
                        key={option.id}
                        className={`skill-dropdown__item ${isSelected ? 'skill-dropdown__item--selected' : ''} ${isHighlighted ? 'skill-dropdown__item--highlighted' : ''}`}
                        onClick={() => handleSelect(option.id)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <span className="skill-dropdown__item-label">{option.name}</span>
                        {option.isSystem && (
                          <span className="skill-dropdown__item-badge">系统</span>
                        )}
                        {isSelected && (
                          <Check size={14} className="skill-dropdown__item-check" />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="skill-dropdown__divider" />
                <div
                  className="skill-dropdown__add-btn"
                  onClick={handleAddSkill}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Plus size={14} />
                  <span>添加 Skill</span>
                </div>
              </div>,
              document.body
            )}
        </div>
      )}
    </KeyboardDropdown>
  );
};
