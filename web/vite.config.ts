import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  publicDir: false,
  build: {
    outDir: resolve(webRoot, '.vite-react'),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve(webRoot, 'src/react-migration-root.tsx'),
      formats: ['es'],
      fileName: () => 'react-migration-root.js',
      cssFileName: 'react-migration-root',
    },
  },
});
