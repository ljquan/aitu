/**
 * 模型健康状态 Hook
 * 
 * 提供模型健康状态数据，支持自动刷新
 * 仅当 baseUrl 为 api.tu-zi.com 时才启用
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { geminiSettings } from '../utils/settings-manager';
import {
    fetchModelHealthData,
    buildHealthMap,
    isTuziApiUrl,
    type ModelHealthStatus,
} from '../services/model-health-service';

export interface UseModelHealthResult {
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

// 刷新间隔（5 分钟）
const REFRESH_INTERVAL = 5 * 60 * 1000;

// 全局缓存（避免每个组件都重复请求）
let globalHealthMap: Map<string, ModelHealthStatus> = new Map();
let globalLastFetch: number = 0;
let globalFetchPromise: Promise<void> | null = null;

/**
 * 模型健康状态 Hook
 */
export function useModelHealth(): UseModelHealthResult {
    const [healthMap, setHealthMap] = useState<Map<string, ModelHealthStatus>>(globalHealthMap);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shouldShowHealth, setShouldShowHealth] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // 检查是否应该显示健康状态
    const checkShouldShow = useCallback(() => {
        const settings = geminiSettings.get();
        const show = isTuziApiUrl(settings.baseUrl || '');
        setShouldShowHealth(show);
        return show;
    }, []);

    // 获取健康数据
    const fetchData = useCallback(async (force: boolean = false) => {
        // 检查是否应该显示
        if (!checkShouldShow()) {
            return;
        }

        // 检查缓存是否有效（5 分钟内）
        const now = Date.now();
        if (!force && globalHealthMap.size > 0 && now - globalLastFetch < REFRESH_INTERVAL) {
            setHealthMap(globalHealthMap);
            return;
        }

        // 如果已经在请求中，等待现有请求完成
        if (globalFetchPromise) {
            await globalFetchPromise;
            setHealthMap(globalHealthMap);
            return;
        }

        setLoading(true);
        setError(null);

        globalFetchPromise = (async () => {
            try {
                const data = await fetchModelHealthData();
                const newMap = buildHealthMap(data);
                globalHealthMap = newMap;
                globalLastFetch = Date.now();
                setHealthMap(newMap);
            } catch (err: any) {
                console.warn('[useModelHealth] Failed to fetch:', err);
                setError(err.message || 'Failed to fetch health data');
            } finally {
                setLoading(false);
                globalFetchPromise = null;
            }
        })();

        await globalFetchPromise;
    }, [checkShouldShow]);

    // 手动刷新
    const refresh = useCallback(async () => {
        await fetchData(true);
    }, [fetchData]);

    // 获取特定模型的健康状态
    const getHealthStatus = useCallback((modelId: string): ModelHealthStatus | undefined => {
        return healthMap.get(modelId);
    }, [healthMap]);

    // 初始化和定时刷新
    useEffect(() => {
        // 初始检查
        const show = checkShouldShow();

        if (show) {
            // 首次加载
            fetchData();

            // 设置定时刷新
            intervalRef.current = setInterval(() => {
                fetchData(true);
            }, REFRESH_INTERVAL);
        }

        // 监听设置变化
        const handleSettingsChange = () => {
            const newShow = checkShouldShow();
            if (newShow && !intervalRef.current) {
                fetchData();
                intervalRef.current = setInterval(() => {
                    fetchData(true);
                }, REFRESH_INTERVAL);
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

    return {
        healthMap,
        loading,
        error,
        shouldShowHealth,
        refresh,
        getHealthStatus,
    };
}

export type { ModelHealthStatus };
