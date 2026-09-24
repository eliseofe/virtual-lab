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
    rollupOptions: {
      // #560: the runtime model must be one instance shared with main.js, so the
      // bundle imports it at runtime (./runtime/runtime-model.js next to the
      // bundle in the asset directory) instead of inlining its own copy.
      external: [/\/runtime\/runtime-model\.js$/],
      output: {
        paths: (id) => (/\/runtime\/runtime-model\.js$/.test(id) ? './runtime/runtime-model.js' : id),
      },
    },
  },
});
