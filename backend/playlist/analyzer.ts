import type { BrowserCookieSource, PlaylistInfo, PlaylistVideo, ProxyConfig, VideoQuality } from '@shared/types';
import { parseSourceUrl } from '../util/platform.js';
import { estimateBytes } from '@shared/format';
import { buildAnalyzeArgs } from '../download/formats.js';
import { runYtDlpCollect } from '../download/ytdlp.js';

interface RawEntry {
  id?: string;
  title?: string;
  duration?: number | null;
  thumbnails?: { url?: string; width?: number }[];
  thumbnail?: string;
  uploader?: string;
  channel?: string;
  url?: string;
  webpage_url?: string;
  availability?: string | null;
  live_status?: string | null;
  _type?: string;
}

interface RawPlaylist extends RawEntry {
  entries?: RawEntry[];
  playlist_count?: number;
  channel_url?: string;
  uploader_url?: string;
  description?: string;
}

function pickThumbnail(entry: RawEntry): string | undefined {
  if (entry.thumbnail) return entry.thumbnail;
  const list = entry.thumbnails ?? [];
  if (!list.length) return undefined;
  const sorted = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url ?? list[list.length - 1]?.url;
}

function entryUrl(entry: RawEntry): string {
  if (entry.webpage_url) return entry.webpage_url;
  if (entry.url && entry.url.startsWith('http')) return entry.url;
  return `https://www.youtube.com/watch?v=${entry.id ?? ''}`;
}

function availability(entry: RawEntry): { isAvailable: boolean; reason?: string } {
  const a = (entry.availability ?? '').toLowerCase();
  if (a === 'private') return { isAvailable: false, reason: 'Private video' };
  if (a === 'needs_auth') return { isAvailable: false, reason: 'Requires sign-in' };
  if (a === 'subscriber_only') return { isAvailable: false, reason: 'Members only' };
  if (a === 'premium_only') return { isAvailable: false, reason: 'Premium only' };
  if ((entry.live_status ?? '') === 'is_upcoming') {
    return { isAvailable: false, reason: 'Premiere not yet available' };
  }
  if (!entry.title || entry.title === '[Deleted video]' || entry.title === '[Private video]') {
    return { isAvailable: false, reason: 'Removed by uploader' };
  }
  return { isAvailable: true };
}

export interface AnalyzeHandle {
  promise: Promise<PlaylistInfo>;
  cancel: () => void;
}

/**
 * Read a playlist, a YouTube channel (its uploads enumerate as a playlist
 * even when the channel has no explicit playlist), or a single video into our
 * domain model.
 * Uses `--flat-playlist` so even 5000-item playlists resolve in seconds.
 * YouTube keeps the flat path; Udemy courses are listed flat too, while each
 * lecture is later resolved through its course for full chapter context.
 */
export function analyzePlaylist(
  rawUrl: string,
  quality: VideoQuality,
  browserCookieSource: BrowserCookieSource = 'none',
  proxy?: ProxyConfig,
  cookiesFile?: string
): AnalyzeHandle {
  const parsed = parseSourceUrl(rawUrl);
  if (!parsed.valid || !parsed.normalized) {
    return {
      promise: Promise.reject(new Error(parsed.reason ?? 'Invalid URL.')),
      cancel: () => undefined
    };
  }

  const { promise: raw, kill } = runYtDlpCollect(
    buildAnalyzeArgs(parsed.normalized, browserCookieSource, proxy, cookiesFile)
  );

  // Captured before the async callback so the narrowed type survives.
  const normalized = parsed.normalized;

  const promise = raw.then((stdout) => {
    const trimmed = stdout.trim();
    if (!trimmed) throw new Error('No data was returned for that link.');

    let data: RawPlaylist;
    try {
      data = JSON.parse(trimmed) as RawPlaylist;
    } catch {
      throw new Error('Could not read the playlist data returned by yt-dlp.');
    }

    if (parsed.platform === 'udemy') {
      return buildUdemyPlaylist(data, normalized, quality);
    }

    return buildYouTubePlaylist(data, parsed, quality);
  });

  return { promise, cancel: kill };
}

function buildYouTubePlaylist(data: RawPlaylist, parsed: { playlistId?: string; videoId?: string; normalized?: string }, quality: VideoQuality): PlaylistInfo {
  const rawEntries: RawEntry[] = Array.isArray(data.entries)
    ? data.entries.filter(Boolean)
    : [data];

  const videos: PlaylistVideo[] = rawEntries.map((entry, i) => {
    const state = availability(entry);
    return {
      id: entry.id ?? `unknown-${i}`,
      title: entry.title?.trim() || 'Untitled video',
      durationSeconds: Math.max(0, Math.round(entry.duration ?? 0)),
      thumbnail: pickThumbnail(entry),
      uploader: entry.uploader ?? entry.channel ?? data.uploader ?? data.channel,
      url: entryUrl(entry),
      index: i + 1,
      isAvailable: state.isAvailable,
      unavailableReason: state.reason
    };
  });

  const totalDurationSeconds = videos.reduce((sum, v) => sum + v.durationSeconds, 0);

  return {
    id: data.id ?? parsed.playlistId ?? parsed.videoId ?? 'unknown',
    title: data.title?.trim() || 'Untitled playlist',
    creator: data.uploader ?? data.channel ?? 'Unknown creator',
    platform: 'youtube',
    channelUrl: data.channel_url ?? data.uploader_url,
    thumbnail: pickThumbnail(data) ?? videos.find((v) => v.thumbnail)?.thumbnail,
    description: data.description?.slice(0, 800),
    videoCount: videos.length,
    totalDurationSeconds,
    estimatedBytes: estimateBytes(totalDurationSeconds, quality),
    videos,
    sourceUrl: parsed.normalized ?? data.webpage_url ?? '',
    fetchedAt: new Date().toISOString()
  } satisfies PlaylistInfo;
}

/**
 * Udemy course or single lecture. `--flat-playlist` lists the curriculum
 * (titles + chapters) without durations; downloads resolve each lecture
 * through its course URL + playlist position so files keep exact titles and
 * chapter folders.
 */
function buildUdemyPlaylist(data: RawPlaylist, normalized: string, quality: VideoQuality): PlaylistInfo {
  const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [];
  const isCourse = entries.length > 0;
  const rawEntries: RawEntry[] = isCourse ? entries : [data];

  const videos: PlaylistVideo[] = rawEntries.map((entry, i) => {
    const title = entry.title?.trim() || 'Untitled lecture';
    return {
      id: entry.id ?? `udemy-${i}`,
      title,
      durationSeconds: 0,
      uploader: entry.uploader ?? data.uploader ?? data.channel,
      // Course lectures download through the course URL + playlist position so
      // yt-dlp carries the chapter and exact lecture title into the filename.
      url: normalized,
      index: i + 1,
      isAvailable: true,
      ...(isCourse ? { playlistItems: i + 1 } : {})
    };
  });

  const title = data.title?.trim() || (isCourse ? 'Udemy course' : 'Udemy lecture');

  return {
    id: data.id ?? 'udemy-course',
    title,
    creator: data.uploader ?? data.channel ?? 'Udemy',
    platform: 'udemy',
    description: data.description?.slice(0, 800),
    videoCount: videos.length,
    totalDurationSeconds: 0,
    estimatedBytes: estimateBytes(0, quality),
    videos,
    sourceUrl: normalized,
    fetchedAt: new Date().toISOString()
  } satisfies PlaylistInfo;
}