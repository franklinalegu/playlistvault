import { clipboard, type BrowserWindow } from 'electron';
import { IPC } from '@shared/types';
import { parseSourceUrl } from '@backend/util/platform.js';
import type { SettingsService } from '@backend/settings/settingsService.js';

const POLL_MS = 1500;

/**
 * Optional clipboard monitoring: when enabled, copying a playlist, course or
 * channel link anywhere on the system offers to analyze it. We only ever read
 * the clipboard while the setting is on, and only forward links that pass
 * validation.
 */
export function startClipboardWatcher(
  getWindow: () => BrowserWindow | null,
  settings: SettingsService
): () => void {
  let lastSeen = '';

  const timer = setInterval(() => {
    if (!settings.get().clipboardMonitoring) return;

    let text = '';
    try {
      text = clipboard.readText().trim();
    } catch {
      return;
    }

    if (!text || text === lastSeen || text.length > 2048) return;
    lastSeen = text;

    const parsed = parseSourceUrl(text);
    if (!parsed.valid || (parsed.kind !== 'playlist' && parsed.kind !== 'channel') || !parsed.normalized) return;

    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.clipboardUrlDetected, parsed.normalized);
    }
  }, POLL_MS);

  return () => clearInterval(timer);
}
