/**
 * 模型健康状态服务
 * 
 * 从 apistatus.tu-zi.com 获取模型健康状态数据
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

/**
 * 获取模型健康状态数据
 * @param intervalMinutes 查询的时间范围（分钟），默认 5 分钟
 */
export async function fetchModelHealthData(
    intervalMinutes: number = 5
): Promise<ModelHealthResponse[]> {
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
            return [];
        }

        const data: ModelHealthResponse[] = await response.json();
        return data;
    } catch (error) {
        console.warn('[ModelHealthService] Failed to fetch health data:', error);
        return [];
    }
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
