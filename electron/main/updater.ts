import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import pkg from 'electron-updater';
import { IPC, type UpdateState } from '@shared/types';
import type { SettingsService } from '@backend/settings/settingsService.js';

const { autoUpdater } = pkg;

let windowGetter: (() => BrowserWindow | null) | null = null;
let configured = false;

function emit(state: UpdateState): void {
  const win = windowGetter?.();
  if (win && !win.isDestroyed()) win.webContents.send(IPC.updateState, state);
}

/**
 * Wire up electron-updater. Downloads are opt-in-ish: we fetch automatically
 * but never restart without the user pressing "Restart & install".
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
    // Delay so startup stays snappy.
    setTimeout(() => void checkForUpdates(false), 8000);
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
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    emit({
      status: 'error',
      message: error instanceof Error ? error.message : 'Update check failed.'
    });
  }
}

export function installUpdate(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
