import { ipcMain, dialog, shell, app, BrowserWindow, Notification, nativeTheme } from 'electron';
import path from 'node:path';
import type {
  AnalyzeRequest,
  ApiResult,
  AppInfo,
  AppSettings,
  DependencyName,
  DownloadJob,
  HistoryEntry,
  PlaylistInfo,
  StartJobRequest,
  YtDlpUpdateStatus
} from '@shared/types';
import { IPC } from '@shared/types';
import type { SettingsService } from '@backend/settings/settingsService.js';
import type { HistoryService } from '@backend/storage/historyService.js';
import type { DownloadManager } from '@backend/download/downloadManager.js';
import { analyzePlaylist, type AnalyzeHandle } from '@backend/playlist/analyzer.js';
import { checkBinaries } from '@backend/ffmpeg/binaries.js';
import { log } from '@backend/util/logger.js';
import { installDependency } from '@backend/setup/dependencyInstaller.js';
import { checkYtDlpUpdate } from '@backend/setup/ytDlpUpdater.js';
import { isSafeDestination } from '@backend/util/sanitize.js';
import { parseSourceUrl } from '@backend/util/platform.js';
import { checkForUpdates, installUpdate } from './updater.js';
import { buildFormatProbeArgs } from '@backend/download/formats.js';
import { runYtDlpCollect } from '@backend/download/ytdlp.js';

/** Injected by Vite from package.json at build time. */
declare const APP_VERSION: string | undefined;

interface Deps {
  getWindow: () => BrowserWindow | null;
  settings: SettingsService;
  history: HistoryService;
  downloads: DownloadManager;
}

/** Wrap a handler so the renderer always receives a typed result, never a throw. */
function handle<T>(
  channel: string,
  fn: (...args: never[]) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await (fn as (...a: unknown[]) => Promise<T> | T)(...args);
      return { ok: true, data } satisfies ApiResult<T>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`ipc:${channel}`, message);
      return { ok: false, error: message } satisfies ApiResult<T>;
    }
  });
}

export function registerIpcHandlers(deps: Deps): void {
  const { getWindow, settings, history, downloads } = deps;

  let activeAnalysis: AnalyzeHandle | null = null;

  const send = (channel: string, payload: unknown): void => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  // ---------- Playlist analysis ----------

  handle<PlaylistInfo>(IPC.playlistAnalyze, async (req: AnalyzeRequest) => {
    activeAnalysis?.cancel();
    const prefs = settings.get();
    const handleRef = analyzePlaylist(
      req.url,
      req.quality,
      prefs.browserCookieSource,
      prefs.proxy,
      prefs.cookiesFile
    );
    activeAnalysis = handleRef;
    try {
      return await handleRef.promise;
    } finally {
      if (activeAnalysis === handleRef) activeAnalysis = null;
    }
  });

  handle<boolean>(IPC.playlistCancelAnalyze, () => {
    activeAnalysis?.cancel();
    activeAnalysis = null;
    return true;
  });

  // ---------- Queue ----------

  handle<DownloadJob>(IPC.queueStart, (req: StartJobRequest) => {
    const job = downloads.enqueue({
      playlist: req.playlist,
      selectedVideoIds: req.selectedVideoIds,
      destination: req.destination,
      options: req.options
    });
    return job;
  });

  handle<DownloadJob[]>(IPC.queueList, () => downloads.list());
  handle<boolean>(IPC.queuePauseJob, (id: string) => (downloads.pauseJob(id), true));
  handle<boolean>(IPC.queueResumeJob, (id: string) => (downloads.resumeJob(id), true));
  handle<boolean>(IPC.queueCancelJob, (id: string) => (downloads.cancelJob(id), true));
  handle<boolean>(IPC.queueRetryJob, (id: string) => (downloads.retryJob(id), true));
  handle<boolean>(IPC.queueRetryItem, (jobId: string, itemId: string) => {
    downloads.retryItem(jobId, itemId);
    return true;
  });
  handle<boolean>(IPC.queueReorder, (ids: string[]) => (downloads.reorder(ids), true));
  handle<boolean>(IPC.queueClearFinished, () => (downloads.clearFinished(), true));

  downloads.on('progress', (snapshot) => send(IPC.queueProgress, snapshot));

  downloads.on('jobDone', (job: DownloadJob, entry: HistoryEntry) => {
    void history.add(entry);
    send(IPC.queueJobDone, { job, entry });

    const prefs = settings.get();
    if (prefs.notificationsEnabled && Notification.isSupported()) {
      const failed = entry.videosFailed;
      new Notification({
        title: failed > 0 ? 'Download finished with errors' : 'Download complete',
        body:
          failed > 0
            ? `${job.playlistTitle} — ${entry.videosCompleted} saved, ${failed} failed.`
            : `${job.playlistTitle} — ${entry.videosCompleted} videos saved.`,
        silent: false
      })
        .on('click', () => {
          void shell.openPath(job.destination);
        })
        .show();
    }
  });

  downloads.on('itemDone', (job: DownloadJob, item) => {
    const prefs = settings.get();
    if (prefs.notificationsEnabled && prefs.notifyOnEachVideo && item.status === 'completed') {
      if (Notification.isSupported()) {
        new Notification({ title: 'Video saved', body: item.title, silent: true }).show();
      }
    }
  });

  // ---------- History ----------

  handle<HistoryEntry[]>(IPC.historyList, () => history.list());
  handle<HistoryEntry[]>(IPC.historyRemove, (id: string) => history.remove(id));
  handle<HistoryEntry[]>(IPC.historyClear, () => history.clear());
  handle<HistoryEntry[]>(IPC.historyToggleFavorite, (id: string) => history.toggleFavorite(id));

  handle<string | null>(IPC.historyExportCsv, async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, {
      title: 'Export download history',
      defaultPath: path.join(app.getPath('documents'), 'playlistvault-history.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return history.exportCsv(result.filePath);
  });

  handle<string | null>(IPC.historyExportJson, async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, {
      title: 'Export download history as JSON',
      defaultPath: path.join(app.getPath('documents'), 'playlistvault-history.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return history.exportJson(result.filePath);
  });

  handle<HistoryEntry[]>(IPC.historySearch, (query: string) => history.search(query));

  // ---------- Settings ----------

  handle<AppSettings>(IPC.settingsGet, () => settings.get());

  handle<AppSettings>(IPC.settingsUpdate, async (patch: Partial<AppSettings>) => {
    const next = await settings.update(patch);
    downloads.setMaxConcurrentJobs(next.maxConcurrentJobs);
    downloads.setBrowserCookieSource(next.browserCookieSource);
    downloads.setCookiesFile(next.cookiesFile);
    downloads.setProxy(next.proxy);
    downloads.setGlobalSpeedLimit(next.globalSpeedLimitKbps);
    nativeTheme.themeSource = next.theme;
    return next;
  });

  handle<AppSettings>(IPC.settingsReset, async () => {
    const next = await settings.reset();
    downloads.setMaxConcurrentJobs(next.maxConcurrentJobs);
    downloads.setBrowserCookieSource(next.browserCookieSource);
    downloads.setCookiesFile(next.cookiesFile);
    downloads.setProxy(next.proxy);
    downloads.setGlobalSpeedLimit(next.globalSpeedLimitKbps);
    nativeTheme.themeSource = next.theme;
    return next;
  });

  // ---------- Shell / dialogs ----------

  handle<string | null>(IPC.dialogChooseFolder, async (current?: string) => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose download folder',
      defaultPath: current && isSafeDestination(current) ? current : app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const chosen = result.filePaths[0];
    if (!isSafeDestination(chosen)) {
      throw new Error('That folder is a protected system location. Please pick another.');
    }
    return chosen;
  });

  handle<string | null>(IPC.dialogChooseFile, async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a cookies file (Netscape format)',
      filters: [
        { name: 'Cookie files', extensions: ['txt', 'cookies', 'cookie'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  handle<boolean>(IPC.shellOpenPath, async (target: string) => {
    if (!target) return false;
    const error = await shell.openPath(path.resolve(target));
    if (error) throw new Error(error);
    return true;
  });

  handle<boolean>(IPC.shellShowItem, (target: string) => {
    if (!target) return false;
    shell.showItemInFolder(path.resolve(target));
    return true;
  });

  handle<boolean>(IPC.shellOpenExternal, async (url: string) => {
    // Only ever hand http(s) URLs to the OS.
    if (!/^https:\/\/|^http:\/\//.test(url)) throw new Error('Blocked non-web link.');
    await shell.openExternal(url);
    return true;
  });

  // ---------- App info & updates ----------

  handle<AppInfo>(IPC.appInfo, async () => ({
    // Unpackaged, app.getVersion() reports Electron's version rather than
    // ours, so fall back to the value injected at build time.
    version: app.isPackaged ? app.getVersion() : (APP_VERSION ?? app.getVersion()),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    userDataPath: app.getPath('userData'),
    logPath: log.getPath() ?? undefined,
    binaries: await checkBinaries()
  }));

  handle(IPC.appCheckBinaries, () => checkBinaries());

  handle<string>(IPC.authTest, async () => {
    const source = settings.get().browserCookieSource;
    if (source === 'none') throw new Error('Choose a browser in Settings first.');
    const { promise } = runYtDlpCollect(
      buildFormatProbeArgs('https://www.youtube.com/watch?v=dQw4w9WgXcQ', source)
    );
    const output = await promise;
    if (!/^\s*\d+\s+(mp4|webm|m4a|mp3|opus|mov)\s+/im.test(output)) {
      throw new Error('The browser session loaded, but YouTube exposed no playable media formats.');
    }
    return `Browser session accepted: ${source}`;
  });

  handle<boolean>(IPC.appOpenLog, async () => {
    const target = log.getPath();
    if (!target) throw new Error('No log file has been created yet.');
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return true;
  });

  handle<string>(IPC.appInstallDependency, (name: DependencyName) =>
    installDependency(name, (progress) => send(IPC.appDependencyProgress, progress))
  );
  handle<YtDlpUpdateStatus>(IPC.ytdlpCheckUpdate, () => checkYtDlpUpdate());
  handle<boolean>(IPC.updateCheck, async () => (await checkForUpdates(true), true));
  handle<boolean>(IPC.updateInstall, () => (installUpdate(), true));

  // ---------- Batch import ----------

  handle<string[]>(IPC.batchImportUrls, async (text: string) => {
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const matches = (text.match(urlRegex) ?? [])
      .map((candidate) => {
        const parsed = parseSourceUrl(candidate);
        return parsed.valid && parsed.normalized ? parsed.normalized : null;
      })
      .filter((u): u is string => u !== null);
    const unique = [...new Set(matches)];
    if (!unique.length) throw new Error('No YouTube or Udemy URLs found in the provided text.');
    return unique;
  });

  handle<string | null>(IPC.batchParseFile, async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Import URLs from file',
      filters: [
        { name: 'Text files', extensions: ['txt', 'text'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const fs = await import('node:fs/promises');
    return fs.readFile(result.filePaths[0], 'utf-8');
  });

  // ---------- Shutdown scheduling ----------

  handle<boolean>(IPC.shutdownSchedule, async (action: 'shutdown' | 'sleep' | 'hibernate') => {
    log.info('shutdown', `Scheduling post-download ${action}`);
    const execFile = (await import('node:child_process')).execFile;

    return new Promise<boolean>((resolve) => {
      if (process.platform === 'win32') {
        const flag = action === 'shutdown' ? '/s' : action === 'sleep' ? '/h' : '/h';
        execFile('shutdown', [flag, '/t', '10', '/f'], (error) => {
          if (error) {
            log.error('shutdown', error.message);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } else {
        const cmd = action === 'shutdown' ? 'shutdown -h +1' :
                    action === 'sleep' ? 'pm-sleep suspend' : 'systemctl suspend';
        execFile('sh', ['-c', cmd], (error) => {
          if (error) {
            log.error('shutdown', error.message);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      }
    });
  });

  handle<boolean>(IPC.shutdownCancel, async () => {
    log.info('shutdown', 'Cancelling scheduled shutdown');
    const execFile = (await import('node:child_process')).execFile;

    return new Promise<boolean>((resolve) => {
      if (process.platform === 'win32') {
        execFile('shutdown', ['/a'], () => resolve(true));
      } else {
        execFile('sh', ['-c', 'shutdown -c'], () => resolve(true));
      }
    });
  });
}
