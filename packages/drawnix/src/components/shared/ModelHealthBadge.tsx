/**
 * 模型健康状态徽章组件
 * 
 * 显示模型的实时健康状态
 * 固定大小的彩色方块，hover 显示状态文字
 */

import React from 'react';
import { Tooltip } from 'tdesign-react';
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

    const { statusLabel, statusColor, errorRate } = status;

    // 计算信号格数 (0-3格) 和 颜色
    // errorRate 是 0-100
    let bars = 3;
    let barColor = statusColor;

    if (errorRate > 80) {
        bars = 1;
        barColor = '#991B1B'; // 深红色
    } else if (errorRate > 50) {
        bars = 1;
        barColor = '#EF4444'; // 红色
    } else if (errorRate > 20) {
        bars = 2;
        barColor = '#C2410C'; // 深橙色
    } else if (errorRate >= 1) {
        bars = 2;
        barColor = '#F97316'; // 浅橙色
    } else {
        bars = 3;
        barColor = '#10B981'; // 绿色 (0 或 接近 0)
    }

    return (
        <Tooltip
            content={errorRate > 0 ? `${statusLabel} (拥挤度：${errorRate}%)` : statusLabel}
            theme="light"
            placement="top"
            showArrow={false}
            zIndex={20000}
        >
            <div className={`model-health-signal ${className}`}>
                <div 
                    className={`model-health-signal__bar ${bars >= 1 ? 'active' : ''}`} 
                    style={{ backgroundColor: bars >= 1 ? barColor : undefined }} 
                />
                <div 
                    className={`model-health-signal__bar ${bars >= 2 ? 'active' : ''}`} 
                    style={{ backgroundColor: bars >= 2 ? barColor : undefined }} 
                />
                <div 
                    className={`model-health-signal__bar ${bars >= 3 ? 'active' : ''}`} 
                    style={{ backgroundColor: bars >= 3 ? barColor : undefined }} 
                />
            </div>
        </Tooltip>
    );
};

export default ModelHealthBadge;
