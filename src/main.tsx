import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles/index.css';

// On Android, Electron's window.vault is absent — provide a no-op so the UI
// still renders (Downloads queue will use native bridge when implemented).
if (Capacitor.isNativePlatform() && !(window as unknown as { vault?: unknown }).vault) {
  // Minimal shim — Home/About degrade gracefully; native yt-dlp comes next.
  (window as unknown as Record<string, unknown>).vault = {
    playlist: {
      analyze: async () => ({ ok: false as const, error: 'Native yt-dlp bridge not yet wired — use dev build or wait for v5.3.' }),
      cancelAnalyze: async () => ({ ok: true as const, data: true })
    },
    queue: {
      start: async () => ({ ok: false as const, error: 'Native download bridge pending' }),
      list: async () => ({ ok: true as const, data: [] }),
      pauseJob: async () => ({ ok: true as const, data: true }),
      resumeJob: async () => ({ ok: true as const, data: true }),
      cancelJob: async () => ({ ok: true as const, data: true }),
      retryJob: async () => ({ ok: true as const, data: true }),
      retryItem: async () => ({ ok: true as const, data: true }),
      reorder: async () => ({ ok: true as const, data: true }),
      clearFinished: async () => ({ ok: true as const, data: true }),
      onProgress: () => () => undefined,
      onJobDone: () => () => undefined
    },
    history: {
      list: async () => ({ ok: true as const, data: [] }),
      remove: async () => ({ ok: true as const, data: [] }),
      clear: async () => ({ ok: true as const, data: [] }),
      toggleFavorite: async () => ({ ok: true as const, data: [] }),
      exportCsv: async () => ({ ok: true as const, data: null }),
      exportJson: async () => ({ ok: true as const, data: null }),
      search: async () => ({ ok: true as const, data: [] })
    },
    settings: {
      get: async () => ({ ok: true as const, data: null }),
      update: async () => ({ ok: true as const, data: null }),
      reset: async () => ({ ok: true as const, data: null })
    },
    system: {
      chooseFolder: async () => ({ ok: true as const, data: null }),
      chooseFile: async () => ({ ok: true as const, data: null }),
      openPath: async () => ({ ok: true as const, data: true }),
      showItem: async () => ({ ok: true as const, data: true }),
      openExternal: async () => ({ ok: true as const, data: true }),
      info: async () => ({ ok: true as const, data: { version: 'android', platform: 'android' } as unknown }),
      checkBinaries: async () => ({ ok: true as const, data: [] }),
      checkYtDlpUpdate: async () => ({ ok: true as const, data: { current: null, latest: null, outdated: false } }),
      testAuth: async () => ({ ok: true as const, data: 'ok' }),
      installDependency: async () => ({ ok: true as const, data: '' }),
      openLog: async () => ({ ok: true as const, data: true }),
      onDependencyProgress: () => () => undefined,
      onClipboardUrl: () => () => undefined,
      onProtocolUrl: () => () => undefined
    },
    batch: {
      importUrls: async (_text: string) => ({ ok: true as const, data: [] }),
      parseFile: async () => ({ ok: true as const, data: null })
    },
    shutdown: { schedule: async () => ({ ok: true as const, data: true }), cancel: async () => ({ ok: true as const, data: true }) },
    updates: { check: async () => ({ ok: true as const, data: true }), install: async () => ({ ok: true as const, data: true }), onState: () => () => undefined }
  };
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
