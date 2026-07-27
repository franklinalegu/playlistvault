import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('./package.json');

export default defineConfig(({ command }) => ({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@backend': fileURLToPath(new URL('./backend', import.meta.url))
    }
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          define: { APP_VERSION: JSON.stringify(version) },
          build: {
            outDir: 'dist-electron/main',
            minify: command === 'build',
            rollupOptions: {
              external: ['electron', 'electron-updater', ...builtins()]
            }
          },
          resolve: {
            alias: {
              '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
              '@backend': fileURLToPath(new URL('./backend', import.meta.url))
            }
          }
        }
      },
      preload: {
        input: 'electron/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            minify: command === 'build',
            rollupOptions: {
              external: ['electron'],
              // Electron loads .mjs preloads as ESM, where `require` does not
              // exist. Emit an explicit CommonJS .cjs file instead.
              output: { format: 'cjs', entryFileNames: 'index.cjs' }
            }
          },
          resolve: {
            alias: {
              '@shared': fileURLToPath(new URL('./shared', import.meta.url))
            }
          }
        }
      }
    }),
    renderer()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200
  },
  server: {
    port: 5183,
    strictPort: true
  }
}));

/** Node builtins that must stay external in the main/preload bundles. */
function builtins(): string[] {
  const names = [
    'fs', 'fs/promises', 'path', 'os', 'url', 'child_process', 'events',
    'crypto', 'stream', 'stream/promises', 'util', 'readline', 'assert', 'buffer'
  ];
  return [...names, ...names.map((n) => `node:${n}`)];
}
