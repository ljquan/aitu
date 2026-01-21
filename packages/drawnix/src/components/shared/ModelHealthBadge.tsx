/**
 * 模型健康状态徽章组件
 * 
 * 显示模型的实时健康状态
 * 固定大小的彩色方块，hover 显示状态文字
 */

import React from 'react';
import { useModelHealth } from '../../hooks/useModelHealth';
import './model-health-badge.scss';

export interface ModelHealthBadgeProps {
    /** 模型 ID */
    modelId: string;
    /** 自定义类名 */
    className?: string;
}

/**
 * 模型健康状态徽章
 */
export const ModelHealthBadge: React.FC<ModelHealthBadgeProps> = ({
    modelId,
    className = '',
}) => {
    const { shouldShowHealth, getHealthStatus } = useModelHealth();

    // 如果不应该显示健康状态，返回 null
    if (!shouldShowHealth) {
        return null;
    }

    const status = getHealthStatus(modelId);

    // 如果没有该模型的健康数据，不显示
    if (!status) {
        return null;
    }

    const { statusLabel, statusColor } = status;

    return (
        <span
            className={`model-health-badge ${className}`}
            title={statusLabel}
            style={{ backgroundColor: statusColor }}
        />
    );
};

export default ModelHealthBadge;
