import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DownloadManager } from '../backend/download/downloadManager';
import { DEFAULT_DOWNLOAD_OPTIONS, type PlaylistInfo } from '../shared/types';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-queue-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function makePlaylist(): PlaylistInfo {
  return {
    id: 'PLxyz',
    title: 'Example playlist',
    creator: 'Someone',
    platform: 'youtube',
    videoCount: 3,
    totalDurationSeconds: 600,
    estimatedBytes: 0,
    sourceUrl: 'https://www.youtube.com/playlist?list=PLxyz',
    fetchedAt: new Date().toISOString(),
    videos: [
      { id: 'aaa111', title: 'One', durationSeconds: 120, url: 'https://youtu.be/aaa111', index: 1, isAvailable: true },
      { id: 'bbb222', title: 'Two', durationSeconds: 240, url: 'https://youtu.be/bbb222', index: 2, isAvailable: true },
      { id: 'ccc333', title: 'Three', durationSeconds: 240, url: 'https://youtu.be/ccc333', index: 3, isAvailable: true }
    ]
  };
}

describe('DownloadManager queue persistence', () => {
  it('restores in-flight jobs as paused so nothing auto-starts', async () => {
    const queuePath = path.join(dir, 'queue.json');
    const first = new DownloadManager(queuePath);
    const playlist = makePlaylist();
    const job = first.enqueue({
      playlist,
      selectedVideoIds: playlist.videos.map((v) => v.id),
      destination: dir,
      options: { ...DEFAULT_DOWNLOAD_OPTIONS }
    });

    // Stop any background runJob that enqueue() kicked off (yt-dlp may be missing)
    // and force a synchronous persist before patching.
    first.shutdown();
    await (first as unknown as { writeQueue: () => Promise<void> }).writeQueue();
    await new Promise((r) => setTimeout(r, 10));

    // Simulate a crash while one item was actively downloading — patch the
    // persisted file directly so the test is deterministic regardless of binary
    // availability or async pump timing. Overwrite all items to known queued
    // states, otherwise a racing runJob may have already marked them failed.
    const raw = JSON.parse(fs.readFileSync(queuePath, 'utf8')) as unknown[];
    const persisted = raw[0] as Record<string, unknown>;
    (persisted as { status: string }).status = 'downloading';
    const items = persisted.items as Array<Record<string, unknown>>;
    for (const it of items) {
      (it as { status: string }).status = 'queued';
      (it as { progress: number }).progress = 0;
      (it as { error: unknown }).error = undefined;
      (it as { attempts: number }).attempts = 0;
    }
    (items[0] as { status: string }).status = 'downloading';
    (items[0] as { progress: number }).progress = 62;
    fs.writeFileSync(queuePath, JSON.stringify(raw));

    const second = new DownloadManager(queuePath);
    second.load();

    const restored = second.get(job.id);
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('paused');
    expect(restored!.items).toHaveLength(3);
    expect(restored!.items[0].status).toBe('queued');
    expect(restored!.items[0].progress).toBe(0);
    expect(restored!.items[1].status).toBe('queued');
    expect(second.list()).toHaveLength(1);
  });

  it('keeps video URLs so resumed items can be re-fetched', async () => {
    const queuePath = path.join(dir, 'queue.json');
    const first = new DownloadManager(queuePath);
    const playlist = makePlaylist();
    first.enqueue({
      playlist,
      selectedVideoIds: playlist.videos.map((v) => v.id),
      destination: dir,
      options: { ...DEFAULT_DOWNLOAD_OPTIONS }
    });
    first.shutdown();
    await (first as unknown as { writeQueue: () => Promise<void> }).writeQueue();
    await new Promise((r) => setTimeout(r, 10));

    const second = new DownloadManager(queuePath);
    second.load();
    // Resume a job: runItem looks up the video URL from the restored index.
    const restored = second.list()[0];
    expect(restored).toBeDefined();
    const urlIndex = (second as unknown as { urlIndex: Map<string, Map<string, { url: string }>> }).urlIndex;
    expect(urlIndex.get(restored.id)?.get('aaa111')?.url).toBe('https://youtu.be/aaa111');
  });

  it('starts empty when no queue file exists', () => {
    const manager = new DownloadManager(path.join(dir, 'nope.json'));
    manager.load();
    expect(manager.list()).toHaveLength(0);
  });
});
