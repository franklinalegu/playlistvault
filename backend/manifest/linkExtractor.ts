/**
 * Extracts every resource link associated with a downloaded video.
 *
 * Source of truth is the `.info.json` yt-dlp writes alongside each file when
 * `--write-info-json` is enabled. That gives us the canonical watch URL,
 * thumbnail, channel, chapters and — critically — the full description, which
 * is where creators put the links people actually want (sources, gear,
 * timestamps, socials).
 */
import fsp from 'node:fs/promises';
import path from 'node:path';

export interface DescriptionLink {
  url: string;
  /** Nearby text on the same description line, used as a human label. */
  label?: string;
}

export interface VideoChapter {
  title: string;
  startSeconds: number;
  /** Deep link that jumps straight to the chapter. */
  url: string;
}

export interface VideoLinks {
  videoId: string;
  title: string;
  /** Basename of the media file actually written to disk. */
  fileName?: string;
  durationSeconds: number;
  uploadDate?: string;
  viewCount?: number;
  watchUrl: string;
  thumbnailUrl?: string;
  channelName?: string;
  channelUrl?: string;
  descriptionLinks: DescriptionLink[];
  chapters: VideoChapter[];
  /** Populated when the info JSON was missing or unreadable. */
  note?: string;
}

/** Matches bare and parenthesised URLs without swallowing trailing punctuation. */
const URL_RE = /\bhttps?:\/\/[^\s<>"'\]),]+[^\s<>"'\]),.;:!?]/gi;

/**
 * Pull links out of a description, de-duplicated and labelled.
 *
 * Creators often write "Gear I use: https://..." so the preceding text on the
 * line makes a far better label than the raw URL.
 */
export function extractDescriptionLinks(description: string): DescriptionLink[] {
  if (!description) return [];

  const seen = new Set<string>();
  const out: DescriptionLink[] = [];

  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const matches = line.match(URL_RE);
    if (!matches) continue;

    for (const match of matches) {
      const url = normalizeUrl(match);
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // Text before the URL on this line, cleaned into a human label.
      let label = line
        .slice(0, line.indexOf(match))
        // Drop any earlier URL on the same line so labels never contain one.
        .replace(URL_RE, ' ')
        // Strip bullets and arrow glyphs used as list decoration.
        .replace(/[-•*▶►▸➤·|>»→⇒\u2013\u2014]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[:,\-\s]+$/, '')
        .replace(/^[:,\-\s]+/, '')
        .trim();

      if (label.length > 90) label = `${label.slice(0, 87)}…`;
      out.push(label ? { url, label } : { url });
    }
  }

  return out;
}

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Convert yt-dlp chapter objects into jump links. */
export function extractChapters(
  chapters: unknown,
  videoId: string
): VideoChapter[] {
  if (!Array.isArray(chapters)) return [];
  const out: VideoChapter[] = [];
  for (const c of chapters) {
    if (!c || typeof c !== 'object') continue;
    const rec = c as { title?: unknown; start_time?: unknown };
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const start = Number(rec.start_time);
    if (!title || !Number.isFinite(start)) continue;
    out.push({
      title,
      startSeconds: Math.max(0, Math.round(start)),
      url: `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.round(start))}s`
    });
  }
  return out;
}

interface RawInfo {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  upload_date?: string;
  view_count?: number;
  webpage_url?: string;
  original_url?: string;
  thumbnail?: string;
  thumbnails?: { url?: string; width?: number }[];
  uploader?: string;
  channel?: string;
  uploader_url?: string;
  channel_url?: string;
  chapters?: unknown;
  _filename?: string;
  filename?: string;
}

function bestThumbnail(info: RawInfo): string | undefined {
  if (info.thumbnail) return info.thumbnail;
  const list = info.thumbnails ?? [];
  if (!list.length) return undefined;
  return [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
}

/**
 * Locate the `.info.json` yt-dlp wrote for a given media file.
 * yt-dlp names it `<output stem>.info.json`, where the stem excludes the
 * media extension — so `01 - Clip.mp4` yields `01 - Clip.info.json`.
 */
export async function findInfoJson(mediaPath: string): Promise<string | null> {
  const dir = path.dirname(mediaPath);
  const stem = path.basename(mediaPath, path.extname(mediaPath));

  const direct = path.join(dir, `${stem}.info.json`);
  try {
    await fsp.access(direct);
    return direct;
  } catch {
    /* fall through to a directory scan */
  }

  // Audio extraction can change the extension after the JSON is written, so
  // fall back to a prefix match within the folder.
  try {
    const files = await fsp.readdir(dir);
    const match = files.find((f) => f.endsWith('.info.json') && stem.startsWith(path.basename(f, '.info.json')));
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

/** Read and normalise one video's links from its info JSON. */
export async function readVideoLinks(params: {
  infoJsonPath: string | null;
  fallbackId: string;
  /** Title from the playlist scan — authoritative, matches the saved file. */
  fallbackTitle: string;
  fileName?: string;
  fallbackUrl?: string;
}): Promise<VideoLinks> {
  const { infoJsonPath, fallbackId, fallbackTitle, fileName, fallbackUrl } = params;

  const base: VideoLinks = {
    videoId: fallbackId,
    title: fallbackTitle,
    fileName,
    durationSeconds: 0,
    watchUrl: fallbackUrl ?? `https://www.youtube.com/watch?v=${fallbackId}`,
    descriptionLinks: [],
    chapters: []
  };

  if (!infoJsonPath) {
    return { ...base, note: 'Metadata file was not written for this video.' };
  }

  let info: RawInfo;
  try {
    info = JSON.parse(await fsp.readFile(infoJsonPath, 'utf8')) as RawInfo;
  } catch {
    return { ...base, note: 'Metadata file could not be read.' };
  }

  const id = info.id ?? fallbackId;
  return {
    videoId: id,
    // Prefer the playlist's title: it is what the on-disk filename was built
    // from, so the manifest row and the file always agree.
    title: fallbackTitle?.trim() || info.title?.trim() || 'Untitled video',
    fileName,
    durationSeconds: Math.max(0, Math.round(info.duration ?? 0)),
    uploadDate: info.upload_date,
    viewCount: typeof info.view_count === 'number' ? info.view_count : undefined,
    watchUrl: info.webpage_url ?? info.original_url ?? base.watchUrl,
    thumbnailUrl: bestThumbnail(info),
    channelName: info.channel ?? info.uploader,
    channelUrl: info.channel_url ?? info.uploader_url,
    descriptionLinks: extractDescriptionLinks(info.description ?? ''),
    chapters: extractChapters(info.chapters, id)
  };
}

/** Remove the info JSON sidecars once the manifest has absorbed them. */
export async function cleanupInfoJson(paths: (string | null)[]): Promise<void> {
  await Promise.all(
    paths
      .filter((p): p is string => Boolean(p))
      .map((p) => fsp.rm(p, { force: true }).catch(() => undefined))
  );
}
