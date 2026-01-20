/* eslint-disable no-restricted-globals */
/**
 * 多 CDN 智能回退策略
 * 
 * 加载优先级：
 * 1. Service Worker 缓存（最快）
 * 2. CDN 1: unpkg.com（无限流量）
 * 3. CDN 2: jsdelivr.net（更稳定）
 * 4. 本地服务器（回退）
 * 
 * 特性：
 * - 自动检测 CDN 健康状态
 * - 失败的 CDN 会被临时降级
 * - 支持自动恢复
 * - 开发模式下自动跳过
 */

// 开发模式检测
const isDevelopment = typeof location !== 'undefined' && 
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

// CDN 源配置
export interface CDNSource {
  name: string;
  // URL 模板，{version} 和 {path} 会被替换
  urlTemplate: string;
  // 健康检查路径
  healthCheckPath: string;
  // 是否启用
  enabled: boolean;
  // 优先级（数字越小优先级越高）
  priority: number;
}

// CDN 健康状态
interface CDNHealthStatus {
  name: string;
  isHealthy: boolean;
  lastCheckTime: number;
  failCount: number;
  // 上次成功时间
  lastSuccessTime: number;
}

// 配置常量
const CDN_CONFIG = {
  // NPM 包名
  packageName: 'aitu-app',
  // 健康检查间隔（毫秒）- 5分钟
  healthCheckInterval: 5 * 60 * 1000,
  // 失败后降级时间（毫秒）- 1分钟
  degradeTimeout: 60 * 1000,
  // 连续失败次数阈值
  failThreshold: 3,
  // 请求超时（毫秒）- 短超时策略：
  // CDN 缓存命中通常 < 200ms，设置 1.5s 超时
  // 超时后快速回退到服务器，避免 CDN 回源慢影响用户体验
  fetchTimeout: 1500,
};

// CDN 源列表（按优先级排序）
const CDN_SOURCES: CDNSource[] = [
  {
    name: 'unpkg',
    urlTemplate: 'https://unpkg.com/aitu-app@{version}/{path}',
    healthCheckPath: 'version.json',
    enabled: true,
    priority: 1,
  },
  {
    name: 'jsdelivr',
    urlTemplate: 'https://cdn.jsdelivr.net/npm/aitu-app@{version}/{path}',
    healthCheckPath: 'version.json',
    enabled: true,
    priority: 2,
  },
  // 可以添加更多 CDN 源
  // {
  //   name: 'cdnjs',
  //   urlTemplate: 'https://cdnjs.cloudflare.com/ajax/libs/aitu-app/{version}/{path}',
  //   healthCheckPath: 'version.json',
  //   enabled: false,
  //   priority: 3,
  // },
];

// CDN 健康状态存储
const cdnHealthStatus: Map<string, CDNHealthStatus> = new Map();

// 初始化健康状态
function initHealthStatus(): void {
  CDN_SOURCES.forEach(source => {
    if (!cdnHealthStatus.has(source.name)) {
      cdnHealthStatus.set(source.name, {
        name: source.name,
        isHealthy: true,
        lastCheckTime: 0,
        failCount: 0,
        lastSuccessTime: Date.now(),
      });
    }
  });
}

// 初始化
initHealthStatus();

/**
 * 标记 CDN 请求成功
 */
export function markCDNSuccess(cdnName: string): void {
  const status = cdnHealthStatus.get(cdnName);
  if (status) {
    status.isHealthy = true;
    status.failCount = 0;
    status.lastSuccessTime = Date.now();
    status.lastCheckTime = Date.now();
  }
}

/**
 * 标记 CDN 请求失败
 */
export function markCDNFailure(cdnName: string): void {
  const status = cdnHealthStatus.get(cdnName);
  if (status) {
    status.failCount++;
    status.lastCheckTime = Date.now();
    
    // 超过失败阈值，标记为不健康
    if (status.failCount >= CDN_CONFIG.failThreshold) {
      status.isHealthy = false;
      console.warn(`[CDN Fallback] ${cdnName} marked as unhealthy after ${status.failCount} failures`);
    }
  }
}

/**
 * 检查 CDN 是否可用
 */
export function isCDNAvailable(cdnName: string): boolean {
  const status = cdnHealthStatus.get(cdnName);
  if (!status) return false;
  
  // 如果健康，直接返回
  if (status.isHealthy) return true;
  
  // 检查是否过了降级时间，可以尝试恢复
  const now = Date.now();
  if (now - status.lastCheckTime > CDN_CONFIG.degradeTimeout) {
    console.log(`[CDN Fallback] Trying to recover ${cdnName}...`);
    return true; // 允许尝试
  }
  
  return false;
}

/**
 * 获取可用的 CDN 源列表（按优先级排序）
 */
export function getAvailableCDNs(): CDNSource[] {
  return CDN_SOURCES
    .filter(source => source.enabled && isCDNAvailable(source.name))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * 清理资源路径中的版本前缀
 * 例如: /aitu-app@0.5.21/assets/index.js -> /assets/index.js
 */
function cleanResourcePath(resourcePath: string): string {
  // 移除可能存在的版本前缀（如 /aitu-app@x.x.x/）
  const versionPrefixPattern = /^\/?(aitu-app@[\d.]+\/)/;
  return resourcePath.replace(versionPrefixPattern, '/');
}

/**
 * 构建 CDN URL
 */
export function buildCDNUrl(source: CDNSource, version: string, resourcePath: string): string {
  // 先清理路径中可能存在的版本前缀
  const cleanPath = cleanResourcePath(resourcePath);
  return source.urlTemplate
    .replace('{version}', version)
    .replace('{path}', cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath);
}

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(url: string, timeout: number = CDN_CONFIG.fetchTimeout): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // 不使用缓存，确保获取最新
      cache: 'no-store',
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 从多个 CDN 尝试获取资源
 * 
 * @param resourcePath 资源相对路径（如 'assets/index.js'）
 * @param version 版本号
 * @param localOrigin 本地服务器 origin（作为最终回退）
 * @returns Response 或 null
 */
export async function fetchFromCDNWithFallback(
  resourcePath: string,
  version: string,
  localOrigin: string
): Promise<{ response: Response; source: string } | null> {
  // 开发模式下跳过 CDN 回退，直接返回 null（让调用方使用本地服务器）
  if (isDevelopment) {
    console.log('[CDN Fallback] 开发模式，跳过 CDN 回退');
    return null;
  }
  
  const availableCDNs = getAvailableCDNs();
  
  // 1. 尝试所有可用的 CDN
  for (const cdn of availableCDNs) {
    const url = buildCDNUrl(cdn, version, resourcePath);
    
    try {
      console.log(`[CDN Fallback] Trying ${cdn.name}: ${url}`);
      const response = await fetchWithTimeout(url);
      
      if (response.ok) {
        // ============================================
        // 多重验证：确保 CDN 返回的是有效资源
        // ============================================
        
        // 1. Content-Type 验证
        const contentType = response.headers.get('Content-Type') || '';
        const isValidContentType = 
          contentType.includes('javascript') ||
          contentType.includes('css') ||
          contentType.includes('json') ||
          contentType.includes('font') ||
          contentType.includes('image') ||
          contentType.includes('woff') ||
          contentType.includes('application/octet-stream');
        
        if (!isValidContentType) {
          console.warn(`[CDN Fallback] ${cdn.name} invalid Content-Type: ${contentType}`);
          markCDNFailure(cdn.name);
          continue;
        }
        
        // 2. Content-Length 验证（JS/CSS 文件不应该太小）
        const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
        const isTextResource = contentType.includes('javascript') || contentType.includes('css') || contentType.includes('json');
        if (isTextResource && contentLength > 0 && contentLength < 50) {
          console.warn(`[CDN Fallback] ${cdn.name} response too small: ${contentLength} bytes`);
          markCDNFailure(cdn.name);
          continue;
        }
        
        // 3. 内容采样验证（检测 HTML 错误页面）
        const clonedResponse = response.clone();
        try {
          const textSample = await clonedResponse.text().then(t => t.slice(0, 200));
          const looksLikeHtml = textSample.includes('<!DOCTYPE') || 
                               textSample.includes('<html') || 
                               textSample.includes('<HTML') ||
                               textSample.includes('Not Found') ||
                               textSample.includes('404');
          
          if (isTextResource && looksLikeHtml) {
            console.warn(`[CDN Fallback] ${cdn.name} returned HTML instead of ${contentType}`);
            markCDNFailure(cdn.name);
            continue;
          }
        } catch (sampleError) {
          // 采样失败不阻止使用（可能是二进制文件）
        }
        
        markCDNSuccess(cdn.name);
        console.log(`[CDN Fallback] Success from ${cdn.name}`);
        return { response, source: cdn.name };
      } else {
        console.warn(`[CDN Fallback] ${cdn.name} returned ${response.status}`);
        markCDNFailure(cdn.name);
      }
    } catch (error) {
      console.warn(`[CDN Fallback] ${cdn.name} failed:`, error);
      markCDNFailure(cdn.name);
    }
  }
  
  // 2. 所有 CDN 都失败，尝试本地服务器
  try {
    // 使用清理后的路径（去掉版本前缀）
    const cleanPath = cleanResourcePath(resourcePath);
    const localUrl = `${localOrigin}/${cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath}`;
    console.log(`[CDN Fallback] Trying local server: ${localUrl}`);
    
    const response = await fetchWithTimeout(localUrl);
    
    if (response.ok) {
      console.log(`[CDN Fallback] Success from local server`);
      return { response, source: 'local' };
    }
  } catch (error) {
    console.warn(`[CDN Fallback] Local server failed:`, error);
  }
  
  // 3. 全部失败
  console.error(`[CDN Fallback] All sources failed for: ${resourcePath}`);
  return null;
}

/**
 * 执行 CDN 健康检查
 */
export async function performHealthCheck(version: string): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  for (const source of CDN_SOURCES) {
    if (!source.enabled) continue;
    
    const url = buildCDNUrl(source, version, source.healthCheckPath);
    
    try {
      const response = await fetchWithTimeout(url, 5000);
      const isHealthy = response.ok;
      results.set(source.name, isHealthy);
      
      if (isHealthy) {
        markCDNSuccess(source.name);
      } else {
        markCDNFailure(source.name);
      }
    } catch {
      results.set(source.name, false);
      markCDNFailure(source.name);
    }
  }
  
  return results;
}

/**
 * 获取 CDN 状态报告
 */
export function getCDNStatusReport(): { name: string; status: CDNHealthStatus }[] {
  return Array.from(cdnHealthStatus.entries()).map(([name, status]) => ({
    name,
    status,
  }));
}

/**
 * 重置所有 CDN 状态（用于调试）
 */
export function resetCDNStatus(): void {
  initHealthStatus();
  console.log('[CDN Fallback] All CDN status reset');
}

/**
 * 获取 CDN 配置
 */
export function getCDNConfig() {
  return {
    ...CDN_CONFIG,
    sources: CDN_SOURCES,
  };
}
