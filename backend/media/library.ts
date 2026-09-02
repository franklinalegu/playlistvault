import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LocalVideo } from '@shared/types';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.mp3', '.m4a', '.opus', '.flac', '.wav', '.webm']);
const MAX_SCAN_DEPTH = 3;
const MAX_FILES = 800;

function toFileUrl(filePath: string): string {
  // vault-media:// + encodeURIComponent of absolute path — handled in mediaProtocol.ts
  // Use encodeURIComponent to preserve Windows drive letter and spaces
  return `vault-media://${encodeURIComponent(filePath)}`;
}

async function scanDir(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth < 0 || out.length >= MAX_FILES) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_FILES) break;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip hidden/system folders and huge node_modules
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '$RECYCLE.BIN') continue;
      await scanDir(full, depth - 1, out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (VIDEO_EXTS.has(ext)) out.push(full);
    }
  }
}

export async function listLocalVideos(opts: {
  historyDestinations: string[];
  defaultDestination: string;
  recentDestinations: string[];
}): Promise<LocalVideo[]> {
  const roots = new Set<string>();
  for (const d of [...opts.historyDestinations, opts.defaultDestination, ...opts.recentDestinations]) {
    if (d && typeof d === 'string') {
      try {
        const resolved = path.resolve(d);
        roots.add(resolved);
        // Also add parent if playlist folder (one level up may contain other playlists)
        roots.add(path.dirname(resolved));
      } catch { /* ignore */ }
    }
  }
  // Filter to existing dirs
  const existing: string[] = [];
  for (const r of roots) {
    try {
      const s = await fsp.stat(r).catch(() => null);
      if (s?.isDirectory()) existing.push(r);
    } catch { /* ignore */ }
  }
  if (existing.length === 0) return [];

  const files: string[] = [];
  for (const root of existing) {
    await scanDir(root, MAX_SCAN_DEPTH, files);
  }
  // Deduplicate (symlinks / overlapping roots)
  const unique = [...new Set(files.map(f => path.resolve(f)))];
  unique.sort((a, b) => {
    try {
      const sa = fs.statSync(a)?.mtimeMs ?? 0;
      const sb = fs.statSync(b)?.mtimeMs ?? 0;
      return sb - sa;
    } catch { return 0; }
  });

  const videos: LocalVideo[] = [];
  for (const filePath of unique.slice(0, MAX_FILES)) {
    try {
      const stat = await fsp.stat(filePath);
      const base = path.basename(filePath);
      const title = base.replace(/\.[^.]+$/, '').replace(/^\d+\s*-\s*/, '').trim() || base;
      const container = path.extname(filePath).slice(1).toLowerCase() || 'mp4';
      // Try to infer playlist title from parent folder
      const playlistTitle = path.basename(path.dirname(filePath));
      videos.push({
        id: randomUUID(),
        title,
        filePath,
        fileUrl: toFileUrl(filePath),
        sizeBytes: stat.size,
        modifiedAt: new Date(stat.mtimeMs).toISOString(),
        playlistTitle: playlistTitle && playlistTitle !== path.basename(path.dirname(path.dirname(filePath))) ? playlistTitle : undefined,
        container,
      });
    } catch { /* skip */ }
  }
  return videos;
}
