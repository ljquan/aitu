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
      'Content-Security-Policy': "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://wiki.tu-zi.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss: data:; frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
      'X-Frame-Options': 'ALLOWALL'
    }
  },

  preview: {
    port: 4300,
    host: 'localhost',
    headers: {
      'Content-Security-Policy': "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://wiki.tu-zi.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss: data:; frame-ancestors 'self' localhost:* 127.0.0.1:* https://api.tu-zi.com;",
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
    }
  },
});
