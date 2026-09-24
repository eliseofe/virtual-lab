import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const SHARED_MODULE = /\/(runtime|results)\/(runtime-model|simulation-commands|results-model|results-commands)\.js$/;

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
      // #560/#562/#564: models and command modules must be one instance shared
      // with the page's own modules (main.js, results-ui.js), so the bundle
      // imports them at runtime from the asset directory instead of inlining
      // its own copies.
      external: [SHARED_MODULE],
      output: {
        paths: (id) => {
          const shared = id.match(SHARED_MODULE);
          return shared ? `./${shared[1]}/${shared[2]}.js` : id;
        },
      },
    },
  },
});
