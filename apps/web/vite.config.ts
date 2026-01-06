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
      'Content-Security-Policy': "frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
      'X-Frame-Options': 'ALLOWALL'
    }
  },

  preview: {
    port: 4300,
    host: 'localhost',
    headers: {
      'Content-Security-Policy': "frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
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
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('tdesign-react')) {
              return 'vendor-tdesign';
            }
            if (id.includes('tdesign-icons-react')) {
              return 'vendor-tdesign-icons';
            }
            if (id.includes('@plait')) {
              return 'vendor-plait';
            }
            if (id.includes('slate')) {
              return 'vendor-slate';
            }
            // Chat UI - 只在 ChatDrawer 使用时加载
            if (id.includes('@llamaindex/chat-ui')) {
              return 'vendor-chat';
            }
            // Mermaid 核心
            if (id.includes('mermaid') && !id.includes('elk')) {
              return 'vendor-mermaid';
            }
            // Mermaid ELK 布局引擎 - 单独分离，按需加载
            if (id.includes('elk') || id.includes('elkjs')) {
              return 'vendor-mermaid-elk';
            }
            // 其他工具库
            if (id.includes('rxjs') || id.includes('roughjs') || id.includes('is-hotkey') || id.includes('classnames')) {
              return 'vendor-utils';
            }
            if (id.includes('@floating-ui') || id.includes('@tanstack') || id.includes('winbox') || id.includes('mobile-detect')) {
              return 'vendor-ui-libs';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
          }
        },
      },
    },
  },
});
