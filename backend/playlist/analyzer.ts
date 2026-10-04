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
  playlist_title?: string;
  playlist?: string;
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
 *
 * Channels additionally sweep the Courses and Podcasts shelves plus the
 * channel's playlists (capped), tagging every video with its shelf and
 * dropping repeats so a video in both uploads and a course downloads once.
 * Missing shelves are skipped silently — a channel without courses simply
 * has no course section.
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
  const ctx = { browserCookieSource, proxy, cookiesFile, kills: [] as (() => void)[] };

  const promise = (async (): Promise<PlaylistInfo> => {
    const stdout = await raw;
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

    if (parsed.kind === 'channel') {
      return buildChannelArchive(data, parsed, quality, ctx);
    }

    return buildYouTubePlaylist(data, parsed, quality);
  })();

  return {
    promise,
    cancel: () => {
      kill();
      for (const k of ctx.kills) {
        try {
          k();
        } catch {
          /* already finished */
        }
      }
    }
  };
}

interface FetchCtx {
  browserCookieSource: BrowserCookieSource;
  proxy?: ProxyConfig;
  cookiesFile?: string;
  kills: (() => void)[];
}

/** One `--flat-playlist` dump; null when the URL has no such shelf. */
async function fetchFlat(url: string, ctx: FetchCtx): Promise<RawPlaylist | null> {
  try {
    const { promise, kill } = runYtDlpCollect(
      buildAnalyzeArgs(url, ctx.browserCookieSource, ctx.proxy, ctx.cookiesFile)
    );
    ctx.kills.push(kill);
    const out = await promise;
    const trimmed = out.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as RawPlaylist;
  } catch {
    return null;
  }
}

/** `<channel>/videos` → `<channel>/<tab>` regardless of which tab was pasted. */
function channelTabUrl(normalized: string, tab: string): string {
  const base = normalized.replace(/\/(videos|shorts|streams|live|featured|community|channels|about|playlists|podcasts|courses)\/?$/i, '');
  return `${base}/${tab}`;
}

/** A `/playlists`-tab entry that points at another playlist (not a video). */
function isPlaylistRef(entry: RawEntry): boolean {
  if ((entry._type ?? '').toLowerCase().includes('playlist')) return true;
  const url = entry.webpage_url ?? entry.url ?? '';
  return /[?&]list=|\/playlist\?|\/podcasts\//i.test(url);
}

function playlistRefUrl(entry: RawEntry): string | null {
  const url = entry.webpage_url ?? entry.url;
  if (url && url.startsWith('http')) return url;
  return null;
}

/**
 * Merge shelf lists into one video array, first occurrence winning.
 * Pure (no I/O) so it is unit-testable.
 */
export function mergeChannelVideos(lists: PlaylistVideo[][]): { videos: PlaylistVideo[]; duplicateCount: number } {
  const seen = new Set<string>();
  const videos: PlaylistVideo[] = [];
  let duplicateCount = 0;
  for (const list of lists) {
    for (const video of list) {
      if (seen.has(video.id)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(video.id);
      videos.push(video);
    }
  }
  // Stable numbering across the merged archive for display and filenames.
  videos.forEach((v, i) => {
    v.index = i + 1;
  });
  return { videos, duplicateCount };
}

/**
 * Channel archive: uploads + podcast sessions + courses + the channel's own
 * playlists, de-duplicated. Every shelf is best-effort — tabs that do not
 * exist on the channel resolve to nothing and are skipped.
 */
async function buildChannelArchive(
  main: RawPlaylist,
  parsed: { playlistId?: string; videoId?: string; normalized?: string },
  quality: VideoQuality,
  ctx: FetchCtx
): Promise<PlaylistInfo> {
  const base = buildYouTubePlaylist(main, { ...parsed, kind: 'channel' }, quality);
  const uploads = base.videos.map((v) => ({ ...v, section: 'uploads' as const }));
  const lists: PlaylistVideo[][] = [uploads];

  const baseUrl = parsed.normalized ?? '';
  if (baseUrl) {
    // Podcast sessions and courses: single flat fetches, skipped when absent.
    for (const [tab, section] of [['podcasts', 'podcast'], ['courses', 'course']] as const) {
      const data = await fetchFlat(channelTabUrl(baseUrl, tab), ctx);
      if (!data) continue;
      const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [data];
      const videos = mapRawEntries(entries, data, section);
      if (videos.length) lists.push(videos);
    }

    // The channel's playlists shelf: expand playlist refs (capped) so course
    // and series playlists the channel curates are archived too.
    const shelf = await fetchFlat(channelTabUrl(baseUrl, 'playlists'), ctx);
    if (shelf && Array.isArray(shelf.entries)) {
      const refs = shelf.entries
        .filter(Boolean)
        .filter(isPlaylistRef)
        .slice(0, 10);
      for (const ref of refs) {
        const refUrl = playlistRefUrl(ref);
        if (!refUrl) continue;
        const data = await fetchFlat(refUrl, ctx);
        if (!data) continue;
        const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [data];
        const title = ref.title?.trim() || data.title?.trim();
        const videos = mapRawEntries(entries, data, 'playlist', title);
        if (videos.length) lists.push(videos);
      }
    }
  }

  const { videos, duplicateCount } = mergeChannelVideos(lists);
  const totalDurationSeconds = videos.reduce((sum, v) => sum + v.durationSeconds, 0);

  return {
    ...base,
    kind: 'channel',
    videos,
    videoCount: videos.length,
    ...(duplicateCount ? { duplicateCount } : {}),
    totalDurationSeconds,
    estimatedBytes: estimateBytes(totalDurationSeconds, quality)
  };
}

/** Map raw yt-dlp entries to domain videos with a shelf tag. */
function mapRawEntries(
  rawEntries: RawEntry[],
  data: RawPlaylist,
  section: PlaylistVideo['section'],
  playlistTitle?: string
): PlaylistVideo[] {
  return rawEntries.map((entry, i) => {
    const state = availability(entry);
    const shelfTitle =
      playlistTitle ?? (entry.playlist_title?.trim() || entry.playlist?.trim() || undefined);
    return {
      id: entry.id ?? `unknown-${i}`,
      title: entry.title?.trim() || 'Untitled video',
      durationSeconds: Math.max(0, Math.round(entry.duration ?? 0)),
      thumbnail: pickThumbnail(entry),
      uploader: entry.uploader ?? entry.channel ?? data.uploader ?? data.channel,
      ...(shelfTitle ? { playlistTitle: shelfTitle } : {}),
      ...(section ? { section } : {}),
      url: entryUrl(entry),
      index: i + 1,
      isAvailable: state.isAvailable,
      unavailableReason: state.reason
    };
  });
}

function buildYouTubePlaylist(data: RawPlaylist, parsed: { playlistId?: string; videoId?: string; normalized?: string; kind?: string }, quality: VideoQuality): PlaylistInfo {
  const rawEntries: RawEntry[] = Array.isArray(data.entries)
    ? data.entries.filter(Boolean)
    : [data];

  const videos: PlaylistVideo[] = mapRawEntries(rawEntries, data, undefined);

  const totalDurationSeconds = videos.reduce((sum, v) => sum + v.durationSeconds, 0);

  return {
    id: data.id ?? parsed.playlistId ?? parsed.videoId ?? 'unknown',
    title: data.title?.trim() || 'Untitled playlist',
    creator: data.uploader ?? data.channel ?? 'Unknown creator',
    platform: 'youtube',
    kind: parsed.kind === 'channel' ? 'channel' : Array.isArray(data.entries) ? 'playlist' : 'video',
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