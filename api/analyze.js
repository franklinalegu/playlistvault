/**
 * POST /api/analyze — playlist/video metadata for the web build.
 *
 * Body: { url: string, quality?: 'best'|'2160p'|'1440p'|'1080p'|'720p'|'480p'|'360p'|'audio-only' }
 * Returns: { ok: true, data: PlaylistInfo } | { ok: false, error }
 *
 * Strategy:
 *  1. Validate + normalize to YouTube/Udemy only (same allow-list as desktop).
 *  2. If yt-dlp is available on the host, run `--dump-single-json --flat-playlist`
 *     (20s cap for serverless) and map to PlaylistInfo.
 *  3. Otherwise, for single YouTube videos, fall back to oEmbed (no key needed)
 *     so the web app still works without a binary. Playlists need yt-dlp —
 *     return 503 with an actionable message.
 *
 * Deploy notes:
 *  - Vercel hobby has a ~10s function limit: keep SOCKET_TIMEOUT low.
 *  - Self-hosted Node with `yt-dlp` on PATH gets full playlist support.
 */
import { spawn } from 'node:child_process';

export const config = { maxDuration: 25 };

const YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);

function isYouTubeHost(host) {
  const h = host.toLowerCase();
  if (YT_HOSTS.has(h)) return true;
  return h.endsWith('.youtube.com') || h === 'youtu.be';
}

function parseUrl(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { valid: false, reason: 'Enter a URL to continue.' };
  let url;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return { valid: false, reason: 'That does not look like a valid URL.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { valid: false, reason: 'Only http(s) links are supported.' };
  }
  const host = url.hostname.toLowerCase();
  if (host === 'udemy.com' || host.endsWith('.udemy.com')) {
    const m = url.pathname.match(/^\/course\/([^/]+)/);
    if (!m) return { valid: false, platform: 'udemy', reason: 'That Udemy link is not a course or lecture URL.' };
    return { valid: true, platform: 'udemy', normalized: trimmed };
  }
  if (!isYouTubeHost(host)) {
    return { valid: false, platform: 'youtube', reason: 'Only YouTube and Udemy links are supported right now.' };
  }
  const playlistId = url.searchParams.get('list');
  const videoId = url.searchParams.get('v') || (host.includes('youtu.be') ? url.pathname.slice(1).split(/[/?]/)[0] : null);
  const kind = playlistId ? 'playlist' : 'video';
  return { valid: true, platform: 'youtube', kind, playlistId, videoId, normalized: trimmed };
}

function estimateBytes(totalSeconds, quality) {
  const mbPerMin = {
    '360p': 7, '480p': 12, '720p': 25, '1080p': 50,
    '1440p': 90, '2160p': 180, best: 60, 'audio-only': 2,
  }[quality] ?? 50;
  return Math.round((totalSeconds / 60) * mbPerMin * 1_000_000);
}

function runYtDlpJson(url) {
  return new Promise((resolve, reject) => {
    const binaries = ['yt-dlp', 'yt_dlp'];
    const tryNext = (i) => {
      if (i >= binaries.length) return reject(Object.assign(new Error('YTDLP_MISSING'), { code: 'YTDLP_MISSING' }));
      const child = spawn(binaries[i], [
        '--dump-single-json', '--flat-playlist', '--ignore-config',
        '--no-warnings', '--no-colors', '--socket-timeout', '12', '--retries', '1', url,
      ], { shell: false, windowsHide: true, timeout: 20000 });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d; if (out.length > 8_000_000) child.kill(); });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => {
        if (e?.code === 'ENOENT') return tryNext(i + 1);
        reject(e);
      });
      child.on('close', (code) => {
        if (code !== 0) {
          if (/enoent/i.test(err)) return tryNext(i + 1);
          const last = err.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('ERROR:')).pop();
          reject(new Error(last?.replace(/^ERROR:\s*/, '') || `yt-dlp exited (${code}).`));
          return;
        }
        resolve(out);
      });
    };
    tryNext(0);
  });
}

function pickThumb(entry) {
  if (entry.thumbnail) return entry.thumbnail;
  const list = entry.thumbnails ?? [];
  if (!list.length) return undefined;
  return [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
}

function mapToPlaylist(data, parsed, quality, sourceUrl) {
  const rawEntries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [data];
  const videos = rawEntries.map((entry, i) => {
    const title = entry.title?.trim() || 'Untitled video';
    const unavailable = !entry.title || entry.title === '[Deleted video]' || entry.title === '[Private video]'
      || ['private', 'needs_auth', 'subscriber_only', 'premium_only'].includes((entry.availability ?? '').toLowerCase());
    return {
      id: entry.id ?? `unknown-${i}`,
      title,
      durationSeconds: Math.max(0, Math.round(entry.duration ?? 0)),
      thumbnail: pickThumb(entry),
      uploader: entry.uploader ?? entry.channel ?? data.uploader ?? data.channel,
      url: entry.webpage_url || (entry.url?.startsWith('http') ? entry.url : `https://www.youtube.com/watch?v=${entry.id ?? ''}`),
      index: i + 1,
      isAvailable: !unavailable,
      ...(unavailable ? { unavailableReason: 'Unavailable' } : {}),
    };
  });
  const total = videos.reduce((s, v) => s + v.durationSeconds, 0);
  return {
    id: data.id ?? parsed.playlistId ?? parsed.videoId ?? 'unknown',
    title: data.title?.trim() || 'Untitled playlist',
    creator: data.uploader ?? data.channel ?? 'Unknown creator',
    platform: parsed.platform ?? 'youtube',
    channelUrl: data.channel_url ?? data.uploader_url,
    thumbnail: pickThumb(data) ?? videos.find((v) => v.thumbnail)?.thumbnail,
    description: data.description?.slice(0, 800),
    videoCount: videos.length,
    totalDurationSeconds: total,
    estimatedBytes: estimateBytes(total, quality),
    videos,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

async function oembedFallback(url) {
  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
    headers: { 'User-Agent': 'playlistvault-web' },
  });
  if (!res.ok) throw new Error('OEMBED_FAILED');
  const o = await res.json();
  const now = new Date().toISOString();
  const video = {
    id: `oembed-${Buffer.from(url).toString('base64url').slice(0, 12)}`,
    title: o.title ?? 'YouTube video',
    durationSeconds: 0,
    thumbnail: o.thumbnail_url,
    uploader: o.author_name,
    url,
    index: 1,
    isAvailable: true,
  };
  return {
    id: video.id,
    title: video.title,
    creator: o.author_name ?? 'YouTube',
    platform: 'youtube',
    thumbnail: o.thumbnail_url,
    videoCount: 1,
    totalDurationSeconds: 0,
    estimatedBytes: estimateBytes(0, '1080p'),
    videos: [video],
    sourceUrl: url,
    fetchedAt: now,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST.' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { url, quality = '1080p' } = body ?? {};
  const parsed = parseUrl(url ?? '');
  if (!parsed.valid) return res.status(400).json({ ok: false, error: parsed.reason ?? 'Invalid URL.' });

  // Try yt-dlp first (full fidelity).
  try {
    const stdout = await runYtDlpJson(parsed.normalized);
    const data = JSON.parse(stdout.trim());
    return res.status(200).json({ ok: true, data: mapToPlaylist(data, parsed, quality, parsed.normalized) });
  } catch (e) {
    if (e?.code !== 'YTDLP_MISSING') {
      // yt-dlp ran but the link failed — surface its message.
      const msg = e instanceof Error ? e.message : 'Could not read that link.';
      if (!/YTDLP_MISSING|OEMBED/.test(msg)) {
        return res.status(422).json({ ok: false, error: msg });
      }
    }
    // No binary on host — single-video fallback via oEmbed.
    if (parsed.platform === 'youtube' && parsed.kind === 'video') {
      try {
        const playlist = await oembedFallback(parsed.normalized);
        return res.status(200).json({ ok: true, data: playlist });
      } catch {
        /* fall through to 503 */
      }
    }
    return res.status(503).json({
      ok: false,
      error: 'Playlist analysis needs the yt-dlp engine, which is not installed on this web host. ' +
        'Install the desktop app for full playlists, or self-host the web API with yt-dlp on PATH.',
      code: 'YTDLP_MISSING',
    });
  }
}
