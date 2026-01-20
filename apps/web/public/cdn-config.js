/**
 * CDN 智能选择器 - 在主应用加载前运行
 * 
 * 功能：
 * 1. 检测可用的 CDN 源
 * 2. 选择最快的 CDN
 * 3. 将选择结果存储到 localStorage
 * 4. 供 Service Worker 使用
 * 
 * 使用方式：
 * 在 index.html 的 <head> 中添加:
 * <script src="cdn-config.js"></script>
 */

(function() {
  'use strict';

  // 开发模式检测 - 本地开发时跳过 CDN 逻辑
  var isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname.endsWith('.localhost');
  
  if (isDevelopment) {
    console.log('[CDN Config] 开发模式，跳过 CDN 检测');
    window.__AITU_CDN__ = { cdn: 'local', latency: 0, timestamp: Date.now(), isDevelopment: true };
    window.__AITU_CDN_API__ = {
      selectBestCDN: function() { return Promise.resolve(window.__AITU_CDN__); },
      getCDNBaseUrl: function() { return null; },
      clearCDNCache: function() {},
      reselectCDN: function() { return Promise.resolve(window.__AITU_CDN__); },
      sources: [],
      config: {},
      isDevelopment: true,
    };
    return; // 直接返回，不执行 CDN 检测
  }

  // 配置
  var CONFIG = {
    packageName: 'aitu-app',
    storageKey: 'aitu-cdn-preference',
    testTimeout: 5000, // 测试超时时间（毫秒）
    cacheExpiry: 3600000, // 缓存过期时间（1小时）
  };

  // CDN 源列表
  var CDN_SOURCES = [
    {
      name: 'unpkg',
      baseUrl: 'https://unpkg.com/' + CONFIG.packageName,
      testPath: '/version.json',
    },
    {
      name: 'jsdelivr',
      baseUrl: 'https://cdn.jsdelivr.net/npm/' + CONFIG.packageName,
      testPath: '/version.json',
    },
  ];

  /**
   * 测试单个 CDN 的响应时间
   */
  function testCDN(source) {
    return new Promise(function(resolve) {
      var startTime = Date.now();
      var testUrl = source.baseUrl + source.testPath + '?t=' + startTime;
      
      var xhr = new XMLHttpRequest();
      xhr.timeout = CONFIG.testTimeout;
      
      xhr.onload = function() {
        if (xhr.status === 200) {
          var latency = Date.now() - startTime;
          resolve({ name: source.name, latency: latency, success: true });
        } else {
          resolve({ name: source.name, latency: Infinity, success: false });
        }
      };
      
      xhr.onerror = function() {
        resolve({ name: source.name, latency: Infinity, success: false });
      };
      
      xhr.ontimeout = function() {
        resolve({ name: source.name, latency: Infinity, success: false });
      };
      
      xhr.open('GET', testUrl, true);
      xhr.send();
    });
  }

  /**
   * 选择最快的 CDN
   */
  function selectBestCDN() {
    // 检查缓存
    try {
      var cached = localStorage.getItem(CONFIG.storageKey);
      if (cached) {
        var data = JSON.parse(cached);
        if (Date.now() - data.timestamp < CONFIG.cacheExpiry) {
          console.log('[CDN Config] Using cached CDN preference:', data.cdn);
          window.__AITU_CDN__ = data;
          return Promise.resolve(data);
        }
      }
    } catch (e) {
      // 忽略解析错误
    }

    // 并行测试所有 CDN
    var tests = CDN_SOURCES.map(testCDN);
    
    return Promise.all(tests).then(function(results) {
      // 过滤成功的结果并按延迟排序
      var successfulResults = results
        .filter(function(r) { return r.success; })
        .sort(function(a, b) { return a.latency - b.latency; });

      if (successfulResults.length === 0) {
        console.warn('[CDN Config] No CDN available, using local');
        return { cdn: 'local', latency: 0, timestamp: Date.now(), allResults: results };
      }

      var best = successfulResults[0];
      var preference = {
        cdn: best.name,
        latency: best.latency,
        timestamp: Date.now(),
        allResults: results,
      };

      // 缓存结果
      try {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(preference));
      } catch (e) {
        // 忽略存储错误
      }

      console.log('[CDN Config] Selected CDN:', best.name, '(' + best.latency + 'ms)');
      console.log('[CDN Config] All results:', results);
      
      // 暴露到全局变量供 SW 使用
      window.__AITU_CDN__ = preference;
      
      return preference;
    });
  }

  /**
   * 获取 CDN 基础 URL
   */
  function getCDNBaseUrl(cdnName, version) {
    for (var i = 0; i < CDN_SOURCES.length; i++) {
      if (CDN_SOURCES[i].name === cdnName) {
        var baseUrl = CDN_SOURCES[i].baseUrl;
        if (version) {
          baseUrl = baseUrl.replace(CONFIG.packageName, CONFIG.packageName + '@' + version);
        }
        return baseUrl;
      }
    }
    return null;
  }

  /**
   * 清除 CDN 缓存（用于调试）
   */
  function clearCDNCache() {
    try {
      localStorage.removeItem(CONFIG.storageKey);
      delete window.__AITU_CDN__;
      console.log('[CDN Config] Cache cleared');
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 强制重新选择 CDN
   */
  function reselectCDN() {
    clearCDNCache();
    return selectBestCDN();
  }

  // 暴露 API
  window.__AITU_CDN_API__ = {
    selectBestCDN: selectBestCDN,
    getCDNBaseUrl: getCDNBaseUrl,
    clearCDNCache: clearCDNCache,
    reselectCDN: reselectCDN,
    sources: CDN_SOURCES,
    config: CONFIG,
  };

  // 页面加载时自动选择 CDN（非阻塞）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      selectBestCDN();
    });
  } else {
    // DOM 已加载完成
    selectBestCDN();
  }

})();
