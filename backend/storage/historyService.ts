import path from 'node:path';
import fsp from 'node:fs/promises';
import { JsonStore } from './jsonStore.js';
import type { HistoryEntry } from '@shared/types';

const MAX_ENTRIES = 2000;

export class HistoryService {
  private readonly store: JsonStore<HistoryEntry[]>;

  constructor(userDataPath: string) {
    this.store = new JsonStore<HistoryEntry[]>(path.join(userDataPath, 'history.json'), []);
  }

  list(): HistoryEntry[] {
    const all = this.store.read();
    return [...all].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  }

  async add(entry: HistoryEntry): Promise<HistoryEntry[]> {
    return this.store.update((current) => [entry, ...current].slice(0, MAX_ENTRIES));
  }

  async remove(id: string): Promise<HistoryEntry[]> {
    return this.store.update((current) => current.filter((e) => e.id !== id));
  }

  async clear(): Promise<HistoryEntry[]> {
    return this.store.reset();
  }

  async toggleFavorite(id: string): Promise<HistoryEntry[]> {
    return this.store.update((current) =>
      current.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e))
    );
  }

  /** Drop entries older than `days`. `0` means keep forever. */
  async prune(days: number): Promise<void> {
    if (!days || days <= 0) return;
    const cutoff = Date.now() - days * 86_400_000;
    await this.store.update((current) =>
      current.filter((e) => new Date(e.finishedAt).getTime() >= cutoff)
    );
  }

  async exportCsv(targetPath: string): Promise<string> {
    const rows = this.list();
    const header = [
      'Playlist', 'Creator', 'Source URL', 'Destination', 'Completed',
      'Failed', 'Skipped', 'Total Bytes', 'Quality', 'Container',
      'Audio Only', 'Started', 'Finished', 'Duration (s)', 'Favorite'
    ];
    const lines = [header.join(',')];

    for (const r of rows) {
      lines.push([
        csv(r.playlistTitle), csv(r.creator), csv(r.sourceUrl), csv(r.destination),
        r.videosCompleted, r.videosFailed, r.videosSkipped, r.totalBytes,
        csv(r.quality), csv(r.container), r.audioOnly ? 'yes' : 'no',
        csv(r.startedAt), csv(r.finishedAt), r.durationSeconds, r.favorite ? 'yes' : 'no'
      ].join(','));
    }

    await fsp.writeFile(targetPath, `\uFEFF${lines.join('\r\n')}`, 'utf8');
    return targetPath;
  }
}

/** Quote a CSV field, escaping embedded quotes. */
function csv(value: string): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
