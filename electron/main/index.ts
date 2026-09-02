import { app, BrowserWindow, shell, nativeTheme, protocol } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setUserDataDir } from '@backend/ffmpeg/binaries.js';
import { initLogger, log } from '@backend/util/logger.js';
import { SettingsService } from '@backend/settings/settingsService.js';
import { HistoryService } from '@backend/storage/historyService.js';
import { DownloadManager } from '@backend/download/downloadManager.js';
import { registerIpcHandlers } from './ipc.js';
import { setupAutoUpdater } from './updater.js';
import { setupYtDlpAutoUpdate } from './ytDlpAutoUpdater.js';
import { startClipboardWatcher } from './clipboard.js';
import { forceRefreshPinnedIcon } from './pinnedIconRefresh.js';
import { registerMediaProtocol } from './mediaProtocol.js';
import { IPC } from '@shared/types';
import { parseYouTubeUrl } from '@backend/util/sanitize.js';

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
let pendingProtocolUrl: string | null = process.argv.find((arg) => arg.startsWith('playlistvault://')) ?? null;

function acceptProtocolUrl(raw: string): void {
  if (!raw.startsWith('playlistvault://')) return;
  pendingProtocolUrl = raw;
  let target: string | undefined;
  try { target = new URL(raw).searchParams.get('url') ?? undefined; } catch { return; }
  const parsed = target ? parseYouTubeUrl(target) : null;
  if (!parsed?.valid || !parsed.normalized || !mainWindow || mainWindow.isDestroyed()) return;
  pendingProtocolUrl = null;
  mainWindow.webContents.send(IPC.protocolUrlDetected, parsed.normalized);
  mainWindow.focus();
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  acceptProtocolUrl(url);
});

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

protocol.registerSchemesAsPrivileged([{ scheme: 'vault-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }]);

app.whenReady().then(() => {
  registerMediaProtocol();
  app.setAppUserModelId('app.playlistvault.desktop');
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient('playlistvault', process.execPath, [path.resolve(process.argv[1] ?? '')]);
  } else {
    app.setAsDefaultProtocolClient('playlistvault');
  }

  const userData = app.getPath('userData');
  // Tools installed at first run live under userData/bin.
  setUserDataDir(userData);

  // Start logging before anything else can fail.
  initLogger(userData);
  log.info('app', `PlaylistVault ${app.getVersion()} starting`);
  log.info('app', `platform=${process.platform} ${process.arch} electron=${process.versions.electron} node=${process.versions.node}`);
  const downloadsDir = path.join(app.getPath('downloads'), 'PlaylistVault');

  const settings = new SettingsService(userData, downloadsDir);
  const history = new HistoryService(userData);
  downloadManager = new DownloadManager(path.join(userData, 'queue.json'));
  downloadManager.load();
  downloadManager.setMaxConcurrentJobs(settings.get().maxConcurrentJobs);
  downloadManager.setBrowserCookieSource(settings.get().browserCookieSource);
  downloadManager.setCookiesFile(settings.get().cookiesFile);

  void history.prune(settings.get().keepHistoryDays);

  const current = settings.get();
  nativeTheme.themeSource = current.theme;

  mainWindow = createWindow();
  if (pendingProtocolUrl) {
    const incoming = pendingProtocolUrl;
    mainWindow.webContents.once('did-finish-load', () => acceptProtocolUrl(incoming));
  }

  registerIpcHandlers({
    getWindow: () => mainWindow,
    settings,
    history,
    downloads: downloadManager
  });

  setupAutoUpdater(() => mainWindow, settings);
  setupYtDlpAutoUpdate(() => mainWindow, settings);
  startClipboardWatcher(() => mainWindow, settings);
  // Force desktop / taskbar pinned icon to new shield-lock icon for all users (Windows icon cache is sticky)
  try { forceRefreshPinnedIcon(); } catch { /* ignore */ }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('second-instance', (_event, commandLine) => {
  const incoming = commandLine.find((arg) => arg.startsWith('playlistvault://'));
  if (incoming) acceptProtocolUrl(incoming);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  log.info('app', 'shutting down');
  downloadManager?.shutdown();
  log.close();
});

// Never let an unexpected error take the whole app down silently.
process.on('uncaughtException', (error) => {
  log.error('uncaught', error);
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandled-rejection', reason);
});
