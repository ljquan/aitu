import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AituUtils',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
    },
    rollupOptions: {
      external: [],
    },
    sourcemap: true,
    outDir: '../../dist/utils',
  },
  plugins: [
    dts({
      entryRoot: 'src',
      outDir: '../../dist/utils',
    }),
  ],
});
