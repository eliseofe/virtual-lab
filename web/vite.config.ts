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
      // #560/#562: the runtime model and the simulation commands must be one
      // instance shared with main.js, so the bundle imports them at runtime
      // (./runtime/… next to the bundle in the asset directory) instead of
      // inlining its own copies.
      external: [/\/runtime\/(runtime-model|simulation-commands)\.js$/],
      output: {
        paths: (id) => {
          const shared = id.match(/\/runtime\/(runtime-model|simulation-commands)\.js$/);
          return shared ? `./runtime/${shared[1]}.js` : id;
        },
      },
    },
  },
});
