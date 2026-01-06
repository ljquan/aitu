/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import fs from 'fs';
import path from 'path';

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

  plugins: [react(), nxViteTsPaths()],

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
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@plait')) {
              return 'plait-vendor';
            }
            if (id.includes('tdesign') || id.includes('lucide') || id.includes('floating-ui')) {
              return 'ui-vendor';
            }
            if (id.includes('mermaid')) {
              return 'mermaid-vendor';
            }
            if (id.includes('slate')) {
              return 'editor-vendor';
            }
            if (id.includes('lodash') || id.includes('rxjs') || id.includes('ahooks')) {
              return 'utils-vendor';
            }
            if (id.includes('xlsx')) {
              return 'xlsx-vendor';
            }
            return 'vendor';
          }
          if (id.includes('packages/drawnix')) {
            return 'drawnix-feature';
          }
        },
      },
    },
  },
});
