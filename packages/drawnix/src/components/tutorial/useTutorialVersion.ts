import { useState, useEffect } from 'react';

/** 缓存版本号，避免重复请求 */
let cachedVersion: string | null = null;
let fetchPromise: Promise<string> | null = null;

/**
 * 获取教程资源版本号
 * 用于 cache busting，支持热更新视频文件
 */
async function fetchTutorialVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;

  if (!fetchPromise) {
    fetchPromise = fetch('/tutorial/version.txt')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch version');
        return res.text();
      })
      .then((text) => {
        cachedVersion = text.trim();
        return cachedVersion;
      })
      .catch(() => {
        // 失败时使用时间戳作为 fallback
        cachedVersion = String(Date.now());
        return cachedVersion;
      });
  }

  return fetchPromise;
}

/**
 * 给 URL 添加版本参数
 * @param url 原始 URL
 * @param version 版本号
 */
export function appendVersion(url: string, version: string): string {
  if (!url || !version) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

/**
 * Hook: 获取教程资源版本号
 */
export function useTutorialVersion() {
  const [version, setVersion] = useState<string>(cachedVersion || '');

  useEffect(() => {
    if (!cachedVersion) {
      fetchTutorialVersion().then(setVersion);
    }
  }, []);

  return version;
}
