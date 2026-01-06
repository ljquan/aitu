/**
 * InspirationBoard Component
 *
 * 灵感创意板块主组件，当画板为空时显示创意模版
 */

import React, { useState, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'tdesign-icons-react';
import { InspirationCard } from './InspirationCard';
import { INSPIRATION_TEMPLATES, ITEMS_PER_PAGE } from './constants';
import type { InspirationBoardProps } from './types';
import './inspiration-board.scss';

export const InspirationBoard: React.FC<InspirationBoardProps> = ({
  isCanvasEmpty,
  onSelectPrompt,
  visible = true,
  className = '',
}) => {
  const [currentPage, setCurrentPage] = useState(0);

  // 计算总页数
  const totalPages = Math.ceil(INSPIRATION_TEMPLATES.length / ITEMS_PER_PAGE);
  const hasMultiplePages = totalPages > 1;

  // 获取当前页的模版
  const currentTemplates = INSPIRATION_TEMPLATES.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  // 切换到上一页
  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  }, [totalPages]);

  // 切换到下一页
  const handleNext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPage((prev) => (prev + 1) % totalPages);
  }, [totalPages]);

  // 选择模版
  const handleSelectTemplate = useCallback((prompt: string) => {
    onSelectPrompt(prompt);
  }, [onSelectPrompt]);

  // 不显示的条件：画板不为空 或 外部控制隐藏
  if (!isCanvasEmpty || !visible) {
    return null;
  }

  return (
    <div
      className={`inspiration-board ${className}`}
    >
      {/* 头部：标题 + 切换按钮 */}
      <div className="inspiration-board__header">
        <h3 className="inspiration-board__title">灵感创意</h3>

        {hasMultiplePages && (
          <div className="inspiration-board__pagination">
            <span className="inspiration-board__page-indicator">
              {currentPage + 1} / {totalPages}
            </span>
            <div className="inspiration-board__nav-buttons">
              <button
                className="inspiration-board__nav-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handlePrev}
                aria-label="上一页"
                data-track="inspiration_click_prev"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <button
                className="inspiration-board__nav-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleNext}
                aria-label="下一页"
                data-track="inspiration_click_next"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 模版卡片网格 */}
      <div className="inspiration-board__grid">
        {currentTemplates.map((template) => (
          <InspirationCard
            key={template.id}
            template={template}
            onClick={() => handleSelectTemplate(template.prompt)}
          />
        ))}

        {/* 占位元素，保持网格对齐 */}
        {currentTemplates.length < ITEMS_PER_PAGE &&
          Array.from({ length: ITEMS_PER_PAGE - currentTemplates.length }).map((_, i) => (
            <div key={`placeholder-${i}`} className="inspiration-card inspiration-card--placeholder" />
          ))}
      </div>
    </div>
  );
};

export default InspirationBoard;
