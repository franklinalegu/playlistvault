import { app, BrowserWindow, shell, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setUserDataDir } from '@backend/ffmpeg/binaries.js';
import { SettingsService } from '@backend/settings/settingsService.js';
import { HistoryService } from '@backend/storage/historyService.js';
import { DownloadManager } from '@backend/download/downloadManager.js';
import { registerIpcHandlers } from './ipc.js';
import { setupAutoUpdater } from './updater.js';
import { startClipboardWatcher } from './clipboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '../..');
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
const PRELOAD = path.join(process.env.APP_ROOT, 'dist-electron/preload/index.cjs');
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// A second instance should focus the existing window, not open a new one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let downloadManager: DownloadManager | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0C0F1A',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0C0F1A00',
      symbolColor: '#C7D2FE',
      height: 40
    },
    icon: path.join(process.env.APP_ROOT!, 'resources/icon.png'),
    webPreferences: {
      preload: PRELOAD,
      // Security hardening: the renderer gets no direct Node access.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  win.once('ready-to-show', () => win.show());

  // External links open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  app.setAppUserModelId('app.playlistvault.desktop');

  const userData = app.getPath('userData');
  // Tools installed at first run live under userData/bin.
  setUserDataDir(userData);
  const downloadsDir = path.join(app.getPath('downloads'), 'PlaylistVault');

  const settings = new SettingsService(userData, downloadsDir);
  const history = new HistoryService(userData);
  downloadManager = new DownloadManager();
  downloadManager.setMaxConcurrentJobs(settings.get().maxConcurrentJobs);

  void history.prune(settings.get().keepHistoryDays);

  const current = settings.get();
  nativeTheme.themeSource = current.theme;

  mainWindow = createWindow();

  registerIpcHandlers({
    getWindow: () => mainWindow,
    settings,
    history,
    downloads: downloadManager
  });

  setupAutoUpdater(() => mainWindow, settings);
  startClipboardWatcher(() => mainWindow, settings);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  downloadManager?.shutdown();
});

// Never let an unexpected error take the whole app down silently.
process.on('uncaughtException', (error) => {
  console.error('[PlaylistVault] Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[PlaylistVault] Unhandled rejection:', reason);
});
