/**
 * 模型健康状态 Context
 * 
 * 提供全局共享的模型健康状态数据
 * 确保所有 ModelHealthBadge 组件使用同一份数据
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { geminiSettings } from '../utils/settings-manager';
import {
    modelHealthFetcher,
    buildHealthMap,
    isTuziApiUrl,
    type ModelHealthStatus,
} from '../services/model-health-service';

export interface ModelHealthContextValue {
    /** 模型 ID 到健康状态的映射 */
    healthMap: Map<string, ModelHealthStatus>;
    /** 是否正在加载 */
    loading: boolean;
    /** 错误信息 */
    error: string | null;
    /** 是否应该显示健康状态（baseUrl 为 tu-zi.com 时为 true） */
    shouldShowHealth: boolean;
    /** 手动刷新数据 */
    refresh: () => Promise<void>;
    /** 根据模型 ID 获取健康状态 */
    getHealthStatus: (modelId: string) => ModelHealthStatus | undefined;
}

const ModelHealthContext = createContext<ModelHealthContextValue | null>(null);

// UI 刷新间隔（5 分钟）
const UI_REFRESH_INTERVAL = 5 * 60 * 1000;

export const ModelHealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [healthMap, setHealthMap] = useState<Map<string, ModelHealthStatus>>(() => {
        const cached = modelHealthFetcher.getCachedData();
        return cached.length > 0 ? buildHealthMap(cached) : new Map();
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shouldShowHealth, setShouldShowHealth] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const checkShouldShow = useCallback(() => {
        const settings = geminiSettings.get();
        const show = isTuziApiUrl(settings.baseUrl || '');
        setShouldShowHealth(show);
        return show;
    }, []);

    const fetchData = useCallback(async (force: boolean = false) => {
        if (!checkShouldShow()) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const data = await modelHealthFetcher.fetch(5, force);
            const newMap = buildHealthMap(data);
            setHealthMap(newMap);
        } catch (err: unknown) {
            console.warn('[ModelHealthContext] Failed to fetch:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to fetch health data';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [checkShouldShow]);

    const refresh = useCallback(async () => {
        await fetchData(true);
    }, [fetchData]);

    const getHealthStatus = useCallback((modelId: string): ModelHealthStatus | undefined => {
        return healthMap.get(modelId);
    }, [healthMap]);

    useEffect(() => {
        const show = checkShouldShow();

        if (show) {
            fetchData();

            intervalRef.current = setInterval(() => {
                fetchData(true);
            }, UI_REFRESH_INTERVAL);
        }

        const handleSettingsChange = () => {
            const newShow = checkShouldShow();
            if (newShow && !intervalRef.current) {
                fetchData();
                intervalRef.current = setInterval(() => {
                    fetchData(true);
                }, UI_REFRESH_INTERVAL);
            } else if (!newShow && intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                setHealthMap(new Map());
            }
        };

        geminiSettings.addListener(handleSettingsChange);

        return () => {
            geminiSettings.removeListener(handleSettingsChange);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [checkShouldShow, fetchData]);

    return (
        <ModelHealthContext.Provider
            value={{
                healthMap,
                loading,
                error,
                shouldShowHealth,
                refresh,
                getHealthStatus,
            }}
        >
            {children}
        </ModelHealthContext.Provider>
    );
};

/**
 * 使用模型健康状态
 */
export function useModelHealthContext(): ModelHealthContextValue {
    const context = useContext(ModelHealthContext);
    if (!context) {
        // 如果没有 Provider，返回默认值（兼容旧代码）
        return {
            healthMap: new Map(),
            loading: false,
            error: null,
            shouldShowHealth: false,
            refresh: async () => {},
            getHealthStatus: () => undefined,
        };
    }
    return context;
}

export type { ModelHealthStatus };
