/**
 * 模型健康状态服务
 * 
 * 从 apistatus.tu-zi.com 获取模型健康状态数据
 * 使用单例模式控制接口调用频率（最小间隔 1 分钟）
 */

// 健康状态响应类型
export interface ModelHealthResponse {
    rule_id: string;
    rule_name: string;
    model_name: string | string[];
    time_bucket: number;
    detect_saturated: boolean;
    error_rate: number;
    status_label: string;
    status_color: string;
    is_low_traffic: boolean;
    total_count: number;
    error_count: number;
    avg_response_time: number | null;
    min_response_time: number | null;
    max_response_time: number | null;
    upstream_error_rate: number | null;
}

// 解析后的健康状态
export interface ModelHealthStatus {
    modelName: string;
    ruleName: string;
    statusLabel: string;
    statusColor: string;
    errorRate: number;
    isLowTraffic: boolean;
    detectSaturated: boolean;
    totalCount: number;
    timeBucket: number;
}

// API 端点
const API_STATUS_BASE_URL = 'https://apistatus.tu-zi.com';

// 最小调用间隔（1 分钟）
const MIN_FETCH_INTERVAL = 60 * 1000;

/**
 * 模型健康状态数据获取单例
 * 控制 API 调用频率，避免重复请求
 */
class ModelHealthFetcher {
    private static instance: ModelHealthFetcher;
    
    // 缓存的数据
    private cachedData: ModelHealthResponse[] = [];
    // 上次成功请求的时间
    private lastFetchTime: number = 0;
    // 当前进行中的请求 Promise（用于防止并发）
    private pendingFetch: Promise<ModelHealthResponse[]> | null = null;

    private constructor() {}

    static getInstance(): ModelHealthFetcher {
        if (!ModelHealthFetcher.instance) {
            ModelHealthFetcher.instance = new ModelHealthFetcher();
        }
        return ModelHealthFetcher.instance;
    }

    /**
     * 获取模型健康数据
     * @param intervalMinutes 查询的时间范围（分钟），默认 5 分钟
     * @param force 是否强制刷新（忽略缓存间隔限制）
     */
    async fetch(intervalMinutes: number = 5, force: boolean = false): Promise<ModelHealthResponse[]> {
        const now = Date.now();
        
        // 检查是否在最小间隔内（非强制模式）
        if (!force && this.cachedData.length > 0 && now - this.lastFetchTime < MIN_FETCH_INTERVAL) {
            return this.cachedData;
        }

        // 如果已有进行中的请求，复用它
        if (this.pendingFetch) {
            return this.pendingFetch;
        }

        // 创建新请求
        this.pendingFetch = this.doFetch(intervalMinutes);
        
        try {
            const data = await this.pendingFetch;
            return data;
        } finally {
            this.pendingFetch = null;
        }
    }

    /**
     * 实际执行 API 请求
     */
    private async doFetch(intervalMinutes: number): Promise<ModelHealthResponse[]> {
        const now = Math.floor(Date.now() / 1000);
        const startTime = now - intervalMinutes * 60;

        const url = `${API_STATUS_BASE_URL}/api/history/aggregated?start_time=${startTime}&end_time=${now}&interval=60`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                console.warn(`[ModelHealthService] API returned ${response.status}`);
                return this.cachedData; // 失败时返回缓存数据
            }

            const data: ModelHealthResponse[] = await response.json();
            this.cachedData = data;
            this.lastFetchTime = Date.now();
            return data;
        } catch (error) {
            console.warn('[ModelHealthService] Failed to fetch health data:', error);
            return this.cachedData; // 失败时返回缓存数据
        }
    }

    /**
     * 获取缓存的数据（不触发请求）
     */
    getCachedData(): ModelHealthResponse[] {
        return this.cachedData;
    }

    /**
     * 获取上次请求时间
     */
    getLastFetchTime(): number {
        return this.lastFetchTime;
    }

    /**
     * 检查缓存是否有效
     */
    isCacheValid(): boolean {
        return this.cachedData.length > 0 && Date.now() - this.lastFetchTime < MIN_FETCH_INTERVAL;
    }
}

// 导出单例实例
export const modelHealthFetcher = ModelHealthFetcher.getInstance();

/**
 * 获取模型健康状态数据
 * @param intervalMinutes 查询的时间范围（分钟），默认 5 分钟
 * @param force 是否强制刷新（忽略缓存间隔限制）
 * @deprecated 推荐使用 modelHealthFetcher.fetch() 以获得更好的控制
 */
export async function fetchModelHealthData(
    intervalMinutes: number = 5,
    force: boolean = false
): Promise<ModelHealthResponse[]> {
    return modelHealthFetcher.fetch(intervalMinutes, force);
}

/**
 * 根据模型 ID 匹配健康状态
 * 
 * 接口返回的 model_name 可能是字符串或字符串数组
 * 需要与本地模型 ID 进行匹配
 */
export function matchModelHealth(
    modelId: string,
    healthData: ModelHealthResponse[]
): ModelHealthStatus | undefined {
    // 从最新的数据开始查找（按 time_bucket 降序）
    const sortedData = [...healthData].sort((a, b) => b.time_bucket - a.time_bucket);

    for (const item of sortedData) {
        const modelNames = Array.isArray(item.model_name)
            ? item.model_name
            : [item.model_name];

        // 检查是否匹配
        if (modelNames.some(name => name === modelId)) {
            return {
                modelName: modelId,
                ruleName: item.rule_name,
                statusLabel: item.status_label,
                statusColor: item.status_color,
                errorRate: item.error_rate,
                isLowTraffic: item.is_low_traffic,
                detectSaturated: item.detect_saturated,
                totalCount: item.total_count,
                timeBucket: item.time_bucket,
            };
        }
    }

    return undefined;
}

/**
 * 构建模型 ID 到健康状态的映射
 */
export function buildHealthMap(
    healthData: ModelHealthResponse[]
): Map<string, ModelHealthStatus> {
    const map = new Map<string, ModelHealthStatus>();

    // 从最新的数据开始处理（按 time_bucket 降序）
    const sortedData = [...healthData].sort((a, b) => b.time_bucket - a.time_bucket);

    for (const item of sortedData) {
        const modelNames = Array.isArray(item.model_name)
            ? item.model_name
            : [item.model_name];

        for (const modelName of modelNames) {
            // 只保留每个模型的最新状态
            if (!map.has(modelName)) {
                map.set(modelName, {
                    modelName,
                    ruleName: item.rule_name,
                    statusLabel: item.status_label,
                    statusColor: item.status_color,
                    errorRate: item.error_rate,
                    isLowTraffic: item.is_low_traffic,
                    detectSaturated: item.detect_saturated,
                    totalCount: item.total_count,
                    timeBucket: item.time_bucket,
                });
            }
        }
    }

    return map;
}

/**
 * 检查 baseUrl 是否为 tu-zi.com
 */
export function isTuziApiUrl(baseUrl: string): boolean {
    return baseUrl.includes('api.tu-zi.com');
}
