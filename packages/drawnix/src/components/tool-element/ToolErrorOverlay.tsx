/**
 * ToolErrorOverlay Component
 *
 * 工具加载错误提示覆盖层
 * 当工具加载失败时显示友好的错误提示
 */

import React from 'react';
import { Button } from 'tdesign-react';
import { ToolErrorType } from '../../types/tool-error.types';

export interface ToolErrorOverlayProps {
  /** 错误类型 */
  errorType: ToolErrorType;

  /** 工具名称 */
  toolName: string;

  /** 工具 URL */
  url: string;

  /** 重试回调 */
  onRetry: () => void;

  /** 移除回调 */
  onRemove: () => void;
}

/**
 * 错误配置映射
 */
const ERROR_CONFIG: Record<
  ToolErrorType,
  {
    icon: string;
    title: string;
    description: string;
  }
> = {
  [ToolErrorType.LOAD_FAILED]: {
    icon: '⚠️',
    title: '加载失败',
    description: '工具无法加载，请检查网络连接',
  },
  [ToolErrorType.CORS_BLOCKED]: {
    icon: '🚫',
    title: '无法显示',
    description: '该网站禁止嵌入到其他页面',
  },
  [ToolErrorType.TIMEOUT]: {
    icon: '⏱️',
    title: '加载超时',
    description: '工具加载时间过长，请重试',
  },
  [ToolErrorType.PERMISSION_DENIED]: {
    icon: '🔒',
    title: '权限不足',
    description: '缺少必要的权限，无法加载',
  },
};

/**
 * 截断 URL 显示
 */
const truncateUrl = (url: string, maxLength: number = 50): string => {
  if (url.length <= maxLength) {
    return url;
  }
  return url.substring(0, maxLength - 3) + '...';
};

/**
 * 工具错误提示覆盖层组件
 */
export const ToolErrorOverlay: React.FC<ToolErrorOverlayProps> = ({
  errorType,
  toolName,
  url,
  onRetry,
  onRemove,
}) => {
  const config = ERROR_CONFIG[errorType];

  return (
    <div className="tool-error-overlay">
      <div className="tool-error-overlay__content">
        <div className="tool-error-overlay__icon">{config.icon}</div>
        <h4 className="tool-error-overlay__title">{config.title}</h4>
        <p className="tool-error-overlay__description">{config.description}</p>
        <div className="tool-error-overlay__details">
          <span className="tool-error-overlay__tool-name">{toolName}</span>
          <span className="tool-error-overlay__url" title={url}>
            {truncateUrl(url)}
          </span>
        </div>
        <div className="tool-error-overlay__actions">
          <Button size="small" theme="primary" onClick={onRetry}>
            重试
          </Button>
          <Button size="small" variant="outline" onClick={onRemove}>
            移除
          </Button>
        </div>
      </div>
    </div>
  );
};
