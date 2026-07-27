import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vitest runs the backend modules directly in Node, so it deliberately does
 * NOT load the Electron plugins from vite.config.ts (those shim Node builtins
 * for the renderer and break `node:path` imports under test).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@backend': fileURLToPath(new URL('./backend', import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts']
  }
});
