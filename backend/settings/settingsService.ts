import path from 'node:path';
import fs from 'node:fs';
import { JsonStore } from '../storage/jsonStore.js';
import { DEFAULT_DOWNLOAD_OPTIONS, type AppSettings } from '@shared/types';
import { isSafeDestination } from '../util/sanitize.js';
import { setBinaryOverrides } from '../ffmpeg/binaries.js';

/**
 * @param firstRunComplete Existing installs have already been set up, so they
 * are marked complete up front and never see the guided wizard again. A fresh
 * install gets `false` so the wizard guides it once.
 */
export function createDefaultSettings(downloadsDir: string, firstRunComplete = true): AppSettings {
  return {
    theme: 'dark',
    accentColor: '#4F46E5',
    defaultDestination: downloadsDir,
    defaultOptions: { ...DEFAULT_DOWNLOAD_OPTIONS },
    maxConcurrentJobs: 1,
    notificationsEnabled: true,
    notifyOnEachVideo: false,
    clipboardMonitoring: false,
    autoCheckUpdates: true,
    autoUpdateYtDlp: true,
    minimizeToTray: false,
    confirmBeforeQuit: true,
    keepHistoryDays: 365,
    recentDestinations: [],
    legalAcknowledged: false,
    browserCookieSource: 'none',
    cookiesFile: undefined,
    proxy: {
      enabled: false,
      type: 'http',
      host: '',
      port: 8080,
      username: '',
      password: ''
    },
    globalSpeedLimitKbps: 0,
    postDownloadAction: 'none',
    keyboardShortcutsEnabled: true,
    showSpeedInNotification: false,
    firstRunComplete
  };
}

export class SettingsService {
  private readonly store: JsonStore<AppSettings>;

  constructor(userDataPath: string, downloadsDir: string) {
    const settingsPath = path.join(userDataPath, 'settings.json');
    const isFreshInstall = !fs.existsSync(settingsPath);
    const defaults = createDefaultSettings(downloadsDir, !isFreshInstall);
    this.store = new JsonStore<AppSettings>(settingsPath, defaults);
    void this.migrate(defaults);
    this.applySideEffects(this.store.read());
  }

  /**
   * Backfill fields added in newer versions.
   *
   * JsonStore merges only the top level, so a nested object saved by an older
   * build (e.g. defaultOptions from v1) is carried over intact and would be
   * missing any keys introduced since. Without this, upgrading users silently
   * lose new defaults such as the resource-links manifest.
   */
  private async migrate(defaults: AppSettings): Promise<void> {
    const current = this.store.read();
    const mergedOptions = { ...defaults.defaultOptions, ...current.defaultOptions };
    const needsOptions =
      Object.keys(mergedOptions).length !== Object.keys(current.defaultOptions ?? {}).length;
    const needsRecents = !Array.isArray(current.recentDestinations);
    const needsCookieSource = !['none', 'chrome', 'edge', 'firefox'].includes(current.browserCookieSource);
    const needsCookiesFile = current.cookiesFile === undefined;
    const needsProxy = !current.proxy;
    const needsPostAction = !current.postDownloadAction;
    const needsKeyboardShortcuts = current.keyboardShortcutsEnabled === undefined;
    const needsAutoUpdateYtDlp = current.autoUpdateYtDlp === undefined;

    if (!needsOptions && !needsRecents && !needsCookieSource && !needsCookiesFile && !needsProxy && !needsPostAction && !needsKeyboardShortcuts && !needsAutoUpdateYtDlp) return;

    await this.store.write({
      ...defaults,
      ...current,
      defaultOptions: mergedOptions,
      recentDestinations: Array.isArray(current.recentDestinations)
        ? current.recentDestinations
        : [],
      browserCookieSource: needsCookieSource ? defaults.browserCookieSource : current.browserCookieSource,
      cookiesFile: needsCookiesFile ? defaults.cookiesFile : current.cookiesFile,
      proxy: needsProxy ? defaults.proxy : current.proxy,
      postDownloadAction: needsPostAction ? defaults.postDownloadAction : current.postDownloadAction,
      keyboardShortcutsEnabled: needsKeyboardShortcuts ? defaults.keyboardShortcutsEnabled : current.keyboardShortcutsEnabled,
      autoUpdateYtDlp: needsAutoUpdateYtDlp ? defaults.autoUpdateYtDlp : current.autoUpdateYtDlp
    });
  }

  get(): AppSettings {
    return this.store.read();
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = await this.store.update((current) => {
      const merged: AppSettings = {
        ...current,
        ...patch,
        defaultOptions: { ...current.defaultOptions, ...(patch.defaultOptions ?? {}) }
      };
      return this.validate(merged, current);
    });
    this.applySideEffects(next);
    return next;
  }

  async reset(): Promise<AppSettings> {
    const next = await this.store.reset();
    this.applySideEffects(next);
    return next;
  }

  /** Clamp anything that could destabilise the app or the file system. */
  private validate(next: AppSettings, previous: AppSettings): AppSettings {
    if (!isSafeDestination(next.defaultDestination)) {
      next.defaultDestination = previous.defaultDestination;
    }
    next.maxConcurrentJobs = clamp(next.maxConcurrentJobs, 1, 4);
    next.defaultOptions.concurrency = clamp(next.defaultOptions.concurrency, 1, 6);
    next.keepHistoryDays = clamp(next.keepHistoryDays, 0, 3650);

    // Keep the recent-folder list clean, unique and bounded.
    next.recentDestinations = Array.from(
      new Set((next.recentDestinations ?? []).filter((d) => typeof d === 'string' && isSafeDestination(d)))
    ).slice(0, 6);
    if (!/^#[0-9a-fA-F]{6}$/.test(next.accentColor)) {
      next.accentColor = previous.accentColor;
    }
    if (!['none', 'chrome', 'edge', 'firefox'].includes(next.browserCookieSource)) {
      next.browserCookieSource = previous.browserCookieSource;
    }

    // Validate proxy settings
    if (next.proxy) {
      if (!['http', 'https', 'socks5'].includes(next.proxy.type)) {
        next.proxy.type = 'http';
      }
      if (typeof next.proxy.port !== 'number' || next.proxy.port < 1 || next.proxy.port > 65535) {
        next.proxy.port = 8080;
      }
      if (typeof next.proxy.host !== 'string') {
        next.proxy.host = '';
      }
    }

    // Validate post-download action
    if (!['none', 'shutdown', 'sleep', 'hibernate'].includes(next.postDownloadAction)) {
      next.postDownloadAction = 'none';
    }

    // Validate speed limit
    next.globalSpeedLimitKbps = clamp(next.globalSpeedLimitKbps, 0, 100000);

    return next;
  }

  private applySideEffects(settings: AppSettings): void {
    setBinaryOverrides({ ytDlpPath: settings.ytDlpPath, ffmpegPath: settings.ffmpegPath });
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
