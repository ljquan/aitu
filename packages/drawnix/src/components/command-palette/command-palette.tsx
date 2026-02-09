import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PlaitBoard } from '@plait/core';
import { CommandItem, CommandCategory, CATEGORY_ORDER, CATEGORY_LABELS } from './command-palette.types';
import { buildDefaultCommands } from './command-registry';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { Search as SearchIcon } from 'lucide-react';
import './command-palette.scss';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  board: PlaitBoard | null;
  container?: HTMLElement | null;
}

/** 简单模糊匹配算法，返回 0~100 的匹配分数 */
function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;

  // 顺序字符匹配
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 40 : 0;
}

function matchCommand(command: CommandItem, query: string): number {
  if (!query) return 1; // 空查询，全部显示

  let best = fuzzyScore(command.label, query);

  if (command.keywords) {
    for (const kw of command.keywords) {
      best = Math.max(best, fuzzyScore(kw, query));
    }
  }
  if (command.shortcut) {
    best = Math.max(best, fuzzyScore(command.shortcut, query));
  }

  return best;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, board }) => {
  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const updateAppState = useCallback(
    (partial: Record<string, any>) => {
      setAppState((prev) => ({ ...prev, ...partial }));
    },
    [setAppState],
  );

  const openDialog = useCallback(
    (type: string) => {
      setAppState((prev) => {
        const newTypes = new Set(prev.openDialogTypes);
        newTypes.add(type as any);
        return { ...prev, openDialogTypes: newTypes };
      });
    },
    [setAppState],
  );

  const commands = useMemo(
    () => buildDefaultCommands(language, updateAppState, openDialog),
    [language, updateAppState, openDialog],
  );

  // 根据查询过滤并排序命令
  const filteredCommands = useMemo(() => {
    if (!board) return [];
    const scored = commands
      .map((cmd) => ({ cmd, score: matchCommand(cmd, query) }))
      .filter(({ score, cmd }) => {
        if (score <= 0) return false;
        // 检查 predicate
        if (cmd.predicate && !cmd.predicate(board)) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (
          CATEGORY_ORDER[a.cmd.category] - CATEGORY_ORDER[b.cmd.category]
        );
      });

    return scored.map(({ cmd }) => cmd);
  }, [commands, query, board]);

  // 按分类分组
  const groupedCommands = useMemo(() => {
    const groups = new Map<CommandCategory, CommandItem[]>();
    for (const cmd of filteredCommands) {
      const list = groups.get(cmd.category) || [];
      list.push(cmd);
      groups.set(cmd.category, list);
    }
    // 按分类顺序排序
    const sorted = [...groups.entries()].sort(
      ([a], [b]) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b],
    );
    return sorted;
  }, [filteredCommands]);

  // 打平的命令列表（用于键盘导航）
  const flatCommands = useMemo(
    () => groupedCommands.flatMap(([, cmds]) => cmds),
    [groupedCommands],
  );

  // 重置
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // 延迟聚焦，等 DOM 挂载
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // activeIndex 限制在范围内
  useEffect(() => {
    if (activeIndex >= flatCommands.length) {
      setActiveIndex(Math.max(0, flatCommands.length - 1));
    }
  }, [flatCommands.length, activeIndex]);

  // 滚动到可见
  useEffect(() => {
    const item = itemRefs.current[activeIndex];
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      if (!board) return;
      onClose();
      // 延迟执行，让面板先关闭
      requestAnimationFrame(() => cmd.perform(board));
    },
    [board, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % Math.max(flatCommands.length, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) =>
            (i - 1 + flatCommands.length) % Math.max(flatCommands.length, 1),
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (flatCommands[activeIndex]) {
            executeCommand(flatCommands[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatCommands, activeIndex, executeCommand, onClose],
  );

  if (!open || !board) return null;

  const isZh = language === 'zh';
  let flatIndex = 0;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 搜索框 */}
        <div className="command-palette__search">
          <SearchIcon size={16} className="command-palette__search-icon" />
          <input
            ref={inputRef}
            className="command-palette__input"
            type="text"
            placeholder={isZh ? '搜索命令...' : 'Search commands...'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-palette__kbd">ESC</kbd>
        </div>

        {/* 命令列表 */}
        <div className="command-palette__list" ref={listRef}>
          {groupedCommands.length === 0 && (
            <div className="command-palette__empty">
              {isZh ? '未找到匹配的命令' : 'No matching commands'}
            </div>
          )}
          {groupedCommands.map(([category, cmds]) => (
            <div key={category} className="command-palette__group">
              <div className="command-palette__group-label">
                {isZh
                  ? CATEGORY_LABELS[category].zh
                  : CATEGORY_LABELS[category].en}
              </div>
              {cmds.map((cmd) => {
                const idx = flatIndex++;
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={cmd.id}
                    ref={(el) => { itemRefs.current[idx] = el; }}
                    className={`command-palette__item ${isActive ? 'command-palette__item--active' : ''}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    {cmd.icon && (
                      <span className="command-palette__item-icon">
                        {cmd.icon}
                      </span>
                    )}
                    <span className="command-palette__item-label">
                      {cmd.label}
                    </span>
                    {cmd.shortcut && (
                      <kbd className="command-palette__item-shortcut">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
