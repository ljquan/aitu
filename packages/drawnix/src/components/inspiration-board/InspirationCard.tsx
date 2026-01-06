/**
 * InspirationCard Component
 *
 * 灵感模版卡片组件，展示单个创意模版
 */

import React from 'react';
import { ArrowRightIcon } from 'tdesign-icons-react';
import { CATEGORY_COLORS } from './constants';
import type { InspirationCardProps } from './types';

export const InspirationCard: React.FC<InspirationCardProps> = ({ template, onClick }) => {
  const colors = CATEGORY_COLORS[template.category];

  const handleMouseDown = (e: React.MouseEvent) => {
    // 阻止默认行为防止输入框失焦，但不阻止事件传播以便 onClick 能触发
    e.preventDefault();
  };

  return (
    <div
      className="inspiration-card"
      onMouseDown={handleMouseDown}
      onClick={onClick}
      data-track={`inspiration_click_${template.id}`}
    >
      {/* 图片区域 */}
      <div className="inspiration-card__image-wrapper">
        <img
          src={template.imageUrl}
          alt={template.title}
          className="inspiration-card__image"
          loading="lazy"
        />

        {/* 分类标签 */}
        <span
          className="inspiration-card__badge"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
          }}
        >
          {template.category}
        </span>

        {/* 悬停箭头 */}
        <div className="inspiration-card__hover-overlay">
          <div className="inspiration-card__arrow">
            <ArrowRightIcon size={16} />
          </div>
        </div>
      </div>

      {/* 文本内容 */}
      <div className="inspiration-card__content">
        <h3 className="inspiration-card__title">{template.title}</h3>
        <p className="inspiration-card__description">{template.description}</p>
      </div>
    </div>
  );
};

export default InspirationCard;
