import type { BrowserWindow } from 'electron';
import { app, net } from 'electron';
import pkg from 'electron-updater';
import { IPC, type UpdateState } from '@shared/types';
import type { SettingsService } from '@backend/settings/settingsService.js';

const { autoUpdater } = pkg;

let windowGetter: (() => BrowserWindow | null) | null = null;
let configured = false;
let checkInProgress = false;
let wasOnline = true;

const STARTUP_CHECK_DELAY_MS = 8_000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const CONNECTIVITY_POLL_INTERVAL_MS = 30 * 1_000;

function emit(state: UpdateState): void {
  const win = windowGetter?.();
  if (win && !win.isDestroyed()) win.webContents.send(IPC.updateState, state);
}

/**
 * Wire up electron-updater. Updates download automatically while the app is
 * running, then install on quit or when the user presses "Restart & install".
 */
export function setupAutoUpdater(
  getWindow: () => BrowserWindow | null,
  settings: SettingsService
): void {
  windowGetter = getWindow;

  if (!app.isPackaged) {
    // electron-updater throws in dev; just report a stable state.
    emit({ status: 'idle', message: 'Updates are disabled in development.' });
    return;
  }

  if (!configured) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => emit({ status: 'checking' }));
    autoUpdater.on('update-available', (info) =>
      emit({ status: 'available', version: info.version })
    );
    autoUpdater.on('update-not-available', () => emit({ status: 'up-to-date' }));
    autoUpdater.on('download-progress', (p) =>
      emit({ status: 'downloading', percent: Math.round(p.percent) })
    );
    autoUpdater.on('update-downloaded', (info) =>
      emit({ status: 'ready', version: info.version })
    );
    autoUpdater.on('error', (error) =>
      emit({ status: 'error', message: error?.message ?? 'Update check failed.' })
    );

    configured = true;
  }

  if (settings.get().autoCheckUpdates) {
    // Delay so startup stays snappy, then keep checking while the app is open.
    wasOnline = net.isOnline();
    setTimeout(() => void checkForUpdates(false), STARTUP_CHECK_DELAY_MS);
    setInterval(() => void checkForUpdates(false), PERIODIC_CHECK_INTERVAL_MS);
    setInterval(() => {
      const online = net.isOnline();
      if (online && !wasOnline) void checkForUpdates(false);
      wasOnline = online;
    }, CONNECTIVITY_POLL_INTERVAL_MS);
  }
}

export async function checkForUpdates(manual: boolean): Promise<void> {
  if (!app.isPackaged) {
    emit({
      status: manual ? 'up-to-date' : 'idle',
      message: 'Updates are disabled in development.'
    });
    return;
  }
  if (checkInProgress) return;
  checkInProgress = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    emit({
      status: 'error',
      message: error instanceof Error ? error.message : 'Update check failed.'
    });
  } finally {
    checkInProgress = false;
  }
}

export function installUpdate(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
