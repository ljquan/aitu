/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import fs from 'fs';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

// Read version from public/version.json
const versionPath = path.resolve(__dirname, 'public/version.json');
let appVersion = '0.0.0';

try {
  if (fs.existsSync(versionPath)) {
    const versionContent = fs.readFileSync(versionPath, 'utf-8');
    const versionJson = JSON.parse(versionContent);
    appVersion = versionJson.version || '0.0.0';
    console.log(`[Vite] Loaded version from version.json: ${appVersion}`);
  } else {
    console.warn('[Vite] version.json not found at', versionPath);
  }
} catch (e) {
  console.error('[Vite] Failed to read version.json', e);
}

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',

  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    __APP_VERSION__: JSON.stringify(appVersion),
  },

  server: {
    port: 7200,
    host: 'localhost',
    headers: {
      'Content-Security-Policy': "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://wiki.tu-zi.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
      'X-Frame-Options': 'ALLOWALL'
    }
  },

  preview: {
    port: 4300,
    host: 'localhost',
    headers: {
      'Content-Security-Policy': "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://wiki.tu-zi.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
      'X-Frame-Options': 'ALLOWALL'
    }
  },

  plugins: [
    react(),
    nxViteTsPaths(),
    visualizer({
      open: false,
      filename: path.resolve(__dirname, '../../dist/apps/web/stats.html'),
      gzipSize: true,
      brotliSize: true,
    }),
  ],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 核心依赖
          if (id.includes('node_modules')) {
            // React 核心（不包括 tdesign-react）
            if (id.includes('react-dom')) {
              return 'vendor-react-dom';
            }
            if (id.includes('react') && !id.includes('tdesign') && !id.includes('lucide')) {
              return 'vendor-react-core';
            }
            // TDesign
            if (id.includes('tdesign-react')) {
              return 'vendor-tdesign';
            }
            if (id.includes('tdesign-icons-react')) {
              return 'vendor-tdesign-icons';
            }
            // Plait
            if (id.includes('@plait')) {
              return 'vendor-plait';
            }
            // Slate
            if (id.includes('slate')) {
              return 'vendor-slate';
            }
            // Chat UI - 只在 ChatDrawer 使用时加载
            if (id.includes('@llamaindex/chat-ui')) {
              return 'vendor-chat';
            }
            // Mermaid - 完全交给 Vite 自动处理，不手动分包
            // 手动分包会导致循环依赖：ReferenceError: Cannot access 'R9n' before initialization
            // 让 Vite 自动分析依赖关系进行最优分割
            // 其他工具库
            if (id.includes('rxjs')) {
              return 'vendor-rxjs';
            }
            if (id.includes('roughjs')) {
              return 'vendor-roughjs';
            }
            if (id.includes('is-hotkey') || id.includes('classnames')) {
              return 'vendor-utils';
            }
            if (id.includes('@floating-ui') || id.includes('@tanstack') || id.includes('winbox') || id.includes('mobile-detect')) {
              return 'vendor-ui-libs';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // XLSX
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            // cytoscape（图布局库，较大）
            if (id.includes('cytoscape')) {
              return 'vendor-cytoscape';
            }
          }
        },
      },
    },
  },
});
