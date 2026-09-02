import { net, Notification, type BrowserWindow } from 'electron';
import { IPC } from '@shared/types';
import type { SettingsService } from '@backend/settings/settingsService.js';
import { checkYtDlpUpdate } from '@backend/setup/ytDlpUpdater.js';
import { installDependency } from '@backend/setup/dependencyInstaller.js';
import { checkBinaries } from '@backend/ffmpeg/binaries.js';
import { log } from '@backend/util/logger.js';

let windowGetter: (() => BrowserWindow | null) | null = null;
let settingsRef: SettingsService | null = null;
let started = false;
let updateInProgress = false;
let wasOnline = true;

const STARTUP_DELAY_MS = 20_000;
const PERIODIC_INTERVAL_MS = 12 * 60 * 60 * 1_000; // every 12 hours
const CONNECTIVITY_POLL_MS = 30_000;
const RETRY_AFTER_OFFLINE_MS = 2 * 60 * 1_000;

let periodicTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;

function isAutoEnabled(): boolean {
  if (!settingsRef) return true;
  const s = settingsRef.get() as unknown as { autoUpdateYtDlp?: boolean; autoCheckUpdates?: boolean };
  // Prefer explicit autoUpdateYtDlp, fall back to autoCheckUpdates for pre-migration installs
  if (typeof s.autoUpdateYtDlp === 'boolean') return s.autoUpdateYtDlp;
  return s.autoCheckUpdates ?? true;
}

function sendProgress(payload: unknown): void {
  const win = windowGetter?.();
  if (win && !win.isDestroyed()) win.webContents.send(IPC.appDependencyProgress, payload);
}

export async function performYtDlpAutoUpdate(reason: string): Promise<void> {
  if (updateInProgress) return;
  if (!isAutoEnabled()) {
    log.info('yt-dlp-auto', `skipped (${reason}): autoUpdateYtDlp disabled`);
    return;
  }
  if (!net.isOnline()) {
    log.info('yt-dlp-auto', `skipped (${reason}): offline`);
    return;
  }

  updateInProgress = true;
  try {
    log.info('yt-dlp-auto', `checking (${reason})`);

    // If binary is missing, install immediately without waiting for GitHub API
    const binaries = await checkBinaries();
    const yt = binaries.find((b) => b.name === 'yt-dlp');
    const missing = !yt?.found;

    if (missing) {
      log.info('yt-dlp-auto', 'yt-dlp missing — installing immediately');
      await installDependency('yt-dlp', (progress) => sendProgress(progress));
      log.info('yt-dlp-auto', 'yt-dlp installed (was missing)');
      notifySuccess(null, null, true);
      return;
    }

    const status = await checkYtDlpUpdate();
    if (!status) return;

    // status.outdated === false when current/latests unknown (offline/API failure) — do not spam installs
    if (!status.outdated) {
      if (status.current && status.latest) {
        log.info('yt-dlp-auto', `up-to-date ${status.current} (latest ${status.latest})`);
      } else {
        log.info('yt-dlp-auto', `check inconclusive — current=${status.current ?? 'unknown'} latest=${status.latest ?? 'unknown'}`);
      }
      return;
    }

    log.info('yt-dlp-auto', `outdated: installed ${status.current} → latest ${status.latest} — updating`);

    // Notify renderer that an auto-update is starting (optional UI can observe dependency progress)
    sendProgress({ name: 'yt-dlp', stage: 'downloading', percent: 0, message: `Updating yt-dlp ${status.current} → ${status.latest}…` });

    await installDependency('yt-dlp', (progress) => sendProgress(progress));

    const fresh = await checkBinaries();
    const freshVer = fresh.find((b) => b.name === 'yt-dlp')?.version ?? status.latest;
    log.info('yt-dlp-auto', `updated to ${freshVer}`);
    notifySuccess(status.current, freshVer ?? status.latest, false);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.warn('yt-dlp-auto', `auto-update failed: ${msg}`);
    sendProgress({ name: 'yt-dlp', stage: 'error', percent: 0, message: msg });
  } finally {
    updateInProgress = false;
  }
}

function notifySuccess(from: string | null, to: string | null, wasMissing: boolean): void {
  if (!Notification.isSupported()) return;
  const s = settingsRef?.get();
  if (s && !s.notificationsEnabled) return;
  try {
    const title = wasMissing ? 'yt-dlp installed' : 'yt-dlp updated automatically';
    const body = wasMissing
      ? `Installed ${to ?? 'latest'} — downloads will now use the new engine.`
      : `Updated ${from ?? ''} → ${to ?? 'latest'} in the background.`;
    new Notification({ title, body, silent: true }).show();
  } catch {
    // ignore notification failures
  }
}

export function setupYtDlpAutoUpdate(
  getWindow: () => BrowserWindow | null,
  settings: SettingsService
): void {
  if (started) return;
  started = true;
  windowGetter = getWindow;
  settingsRef = settings;
  wasOnline = net.isOnline();

  // Staggered startup — keep launch snappy
  setTimeout(() => void performYtDlpAutoUpdate('startup'), STARTUP_DELAY_MS);

  // Periodic checks while the app stays open
  periodicTimer = setInterval(() => void performYtDlpAutoUpdate('periodic'), PERIODIC_INTERVAL_MS);
  // Allow Node to exit if this is the only timer left
  if (periodicTimer && typeof (periodicTimer as unknown as { unref?: () => void }).unref === 'function') {
    (periodicTimer as unknown as { unref: () => void }).unref();
  }

  // When connectivity returns, check soon after (debounced)
  pollTimer = setInterval(() => {
    const online = net.isOnline();
    if (online && !wasOnline) {
      setTimeout(() => void performYtDlpAutoUpdate('back-online'), RETRY_AFTER_OFFLINE_MS);
    }
    if (!online && wasOnline) {
      log.info('yt-dlp-auto', 'offline — pausing checks');
    }
    wasOnline = online;
  }, CONNECTIVITY_POLL_MS);
  if (pollTimer && typeof (pollTimer as unknown as { unref?: () => void }).unref === 'function') {
    (pollTimer as unknown as { unref: () => void }).unref();
  }

  log.info('yt-dlp-auto', 'scheduler started (startup + 12h interval + on-reconnect)');
}

export function stopYtDlpAutoUpdate(): void {
  if (periodicTimer) clearInterval(periodicTimer);
  if (pollTimer) clearInterval(pollTimer);
  periodicTimer = null;
  pollTimer = null;
  started = false;
}
