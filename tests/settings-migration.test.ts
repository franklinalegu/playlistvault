import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SettingsService } from '../backend/settings/settingsService';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-settings-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A settings.json as written by v1.0.0, before the manifest feature. */
function writeV1(): void {
  fs.writeFileSync(
    path.join(dir, 'settings.json'),
    JSON.stringify({
      theme: 'light',
      accentColor: '#10B981',
      defaultDestination: '/home/user/Videos',
      defaultOptions: {
        quality: '720p', container: 'mkv', audioFormat: 'mp3', audioOnly: false,
        embedThumbnail: true, writeSubtitles: false, subtitleLanguages: ['en'],
        numberFiles: true, skipDuplicates: true, createPlaylistFolder: true, concurrency: 2
      },
      maxConcurrentJobs: 1,
      notificationsEnabled: true,
      keepHistoryDays: 365
    })
  );
}

describe('settings migration from v1', () => {
  it('backfills the new manifest option without losing user choices', async () => {
    writeV1();
    const svc = new SettingsService(dir, '/downloads');
    await new Promise((r) => setTimeout(r, 30));
    const s = svc.get();
    // new field appears...
    expect(s.defaultOptions.writeResourceManifest).toBe(true);
    // ...and existing preferences survive
    expect(s.defaultOptions.quality).toBe('720p');
    expect(s.defaultOptions.container).toBe('mkv');
    expect(s.theme).toBe('light');
    expect(s.accentColor).toBe('#10B981');
  });

  it('adds recentDestinations when absent', async () => {
    writeV1();
    const svc = new SettingsService(dir, '/downloads');
    await new Promise((r) => setTimeout(r, 30));
    expect(Array.isArray(svc.get().recentDestinations)).toBe(true);
  });

  it('persists the migration to disk', async () => {
    writeV1();
    // eslint-disable-next-line no-new
    new SettingsService(dir, '/downloads');
    await new Promise((r) => setTimeout(r, 80));
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
    expect(raw.defaultOptions.writeResourceManifest).toBe(true);
  });

  it('caps and de-duplicates recent destinations', async () => {
    const svc = new SettingsService(dir, '/downloads');
    await svc.update({
      recentDestinations: ['/a', '/a', '/b', '/c', '/d', '/e', '/f', '/g']
    });
    const r = svc.get().recentDestinations;
    expect(r.length).toBeLessThanOrEqual(6);
    expect(new Set(r).size).toBe(r.length);
  });

  it('starts clean with no existing file', () => {
    const svc = new SettingsService(dir, '/downloads');
    expect(svc.get().defaultOptions.writeResourceManifest).toBe(true);
  });

  it('guides a fresh install through first run', () => {
    const svc = new SettingsService(dir, '/downloads');
    expect(svc.get().firstRunComplete).toBe(false);
  });

  it('never re-runs the wizard for existing installs', () => {
    writeV1();
    const svc = new SettingsService(dir, '/downloads');
    expect(svc.get().firstRunComplete).toBe(true);
  });
});
