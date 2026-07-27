import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DownloadManager } from '../backend/download/downloadManager';
import { SettingsService } from '../backend/settings/settingsService';
import { isSafeDestination } from '../backend/util/sanitize';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../shared/types';

const playlist = {
  id: 'p', title: 'My Playlist', creator: 'c', videoCount: 1,
  totalDurationSeconds: 5, estimatedBytes: 1,
  videos: [{ id: 'v1', title: 'Clip', durationSeconds: 5,
             url: 'http://127.0.0.1:9/x.mp4', index: 1, isAvailable: true }],
  sourceUrl: 'http://x/', fetchedAt: new Date().toISOString()
} as never;

describe('destination on other drives', () => {
  it('accepts drive letters other than C:', () => {
    for (const d of ['D:\\Videos', 'E:\\Media\\YouTube', 'F:\\', 'D:/Videos']) {
      expect(isSafeDestination(d)).toBe(true);
    }
  });

  it('accepts UNC network paths', () => {
    expect(isSafeDestination('\\\\NAS\\share\\videos')).toBe(true);
  });

  it('still blocks protected system folders', () => {
    expect(isSafeDestination('C:\\Windows\\System32')).toBe(false);
    expect(isSafeDestination('C:\\Program Files\\App')).toBe(false);
  });
});

describe('settings persist a preferred drive', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-dest-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('stores a D: drive path verbatim', async () => {
    const svc = new SettingsService(dir, '/downloads');
    await svc.update({ defaultDestination: 'D:\\Videos' });
    expect(svc.get().defaultDestination).toBe('D:\\Videos');
  });

  it('survives a reload', async () => {
    const a = new SettingsService(dir, '/downloads');
    await a.update({ defaultDestination: 'E:\\Media' });
    await new Promise((r) => setTimeout(r, 60));
    expect(new SettingsService(dir, '/downloads').get().defaultDestination).toBe('E:\\Media');
  });

  it('reverts an unsafe folder instead of storing it', async () => {
    const svc = new SettingsService(dir, '/downloads');
    await svc.update({ defaultDestination: 'D:\\Videos' });
    await svc.update({ defaultDestination: 'C:\\Windows\\System32' });
    expect(svc.get().defaultDestination).toBe('D:\\Videos');
  });
});

describe('unwritable destination fails loudly', () => {
  let ro: string;
  beforeEach(() => {
    ro = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-ro-'));
    fs.chmodSync(ro, 0o555);
  });
  afterEach(() => {
    fs.chmodSync(ro, 0o755);
    fs.rmSync(ro, { recursive: true, force: true });
  });

  it('reports a clear error rather than hanging on "downloading"', async () => {
    const mgr = new DownloadManager();
    const done = new Promise<{ status: string; items: { error?: string }[] }>((resolve) =>
      mgr.on('jobDone', (job) => resolve(job as never))
    );

    mgr.enqueue({
      playlist,
      selectedVideoIds: ['v1'],
      destination: path.join(ro, 'nested'),
      options: { ...DEFAULT_DOWNLOAD_OPTIONS, writeResourceManifest: false }
    });

    const finished = await Promise.race([
      done,
      new Promise((r) => setTimeout(() => r(null), 8000))
    ]);

    expect(finished).not.toBeNull();
    const job = finished as { status: string; items: { error?: string }[] };
    expect(job.status).toBe('failed');
    expect(job.items[0].error).toMatch(/Permission denied|not found|read-only/i);
    mgr.shutdown();
  }, 15000);
});
