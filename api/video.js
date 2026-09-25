/**
 * GET /api/video?url=…&quality=1080p&audioOnly=0 — stream one video to the browser.
 *
 * The web/PWA queue uses this for per-file "Save" so people can use
 * PlaylistVault without installing anything: the hosted service runs yt-dlp
 * and the browser saves the bytes (anchor download or File System Access API).
 *
 * Query:
 *   url       required, YouTube/Udemy http(s) only
 *   quality   360p|480p|720p|1080p|1440p|2160p|best (default 1080p)
 *   audioOnly 1|0 (default 0) — extracts MP3 when 1
 *
 * Notes:
 *  - Serverless timeouts apply (Vercel hobby ~10s, pro up to 60s+): long 4K
 *    videos may exceed the limit — self-host Node for large libraries.
 *  - Never spawns a shell; URL allow-listed and passed as discrete argv.
 */
import { spawn } from 'node:child_process';

export const config = { maxDuration: 60 };

const YT_SUFFIX = '.youtube.com';

function validSource(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'udemy.com' || h.endsWith('.udemy.com')) return true;
    if (h === 'youtu.be' || h === 'youtube-nocookie.com' || h === 'www.youtube-nocookie.com') return true;
    if (h === 'youtube.com' || h.endsWith(YT_SUFFIX)) return true;
    return false;
  } catch {
    return false;
  }
}

function formatSelector(quality, audioOnly) {
  if (audioOnly) return 'bestaudio/best';
  if (quality === 'best') return 'bv*+ba/b';
  const height = { '2160p': 2160, '1440p': 1440, '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 }[quality] ?? 1080;
  return `bv*[height<=${height}]+ba/b[height<=${height}]/bv*+ba/b`;
}

export default async function handler(req, res) {
  const url = req.query?.url;
  const quality = req.query?.quality ?? '1080p';
  const audioOnly = req.query?.audioOnly === '1' || req.query?.audioOnly === 'true';

  if (!url || typeof url !== 'string' || !validSource(url)) {
    return res.status(400).json({ ok: false, error: 'Only YouTube and Udemy links are supported.' });
  }

  const args = [
    '--no-playlist', '--ignore-config', '--no-warnings', '--no-colors',
    '--socket-timeout', '20', '--retries', '3',
    '--format', formatSelector(quality, audioOnly),
    '--output', '-',
  ];
  if (audioOnly) args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  else args.push('--merge-output-format', 'mp4');
  args.push(url);

  let child;
  try {
    child = spawn('yt-dlp', args, { shell: false, windowsHide: true });
  } catch {
    return res.status(503).json({ ok: false, error: 'Download engine unavailable on this host. Install the desktop app instead.' });
  }

  const ext = audioOnly ? 'mp3' : 'mp4';
  const type = audioOnly ? 'audio/mpeg' : 'video/mp4';
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="playlistvault.${ext}"`);
  res.setHeader('Cache-Control', 'no-store');

  let stderr = '';
  child.stderr.on('data', (d) => { stderr = `${stderr}${d}`.slice(-4000); });
  child.on('error', (e) => {
    if (e?.code === 'ENOENT' && !res.headersSent) {
      res.status(503).json({ ok: false, error: 'Download engine unavailable on this host. Install the desktop app instead.' });
    } else if (!res.writableEnded) {
      try { res.end(); } catch { /* noop */ }
    }
  });

  // Backpressure-safe pipe; Vercel supports streaming via res.write.
  child.stdout.on('data', (chunk) => {
    const canContinue = res.write(chunk);
    if (!canContinue) child.stdout.pause();
  });
  res.on('drain', () => { try { child.stdout.resume(); } catch { /* noop */ } });
  req.on('close', () => { try { child.kill('SIGTERM'); } catch { /* noop */ } });

  child.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) {
      // If nothing was written, convert to JSON error; otherwise just end.
      if (!res.writableLength) {
        try {
          res.status(502).json({ ok: false, error: 'Could not download that video (engine error). Try a lower quality or the desktop app.' });
        } catch { /* headers already sent */ }
        return;
      }
    }
    try { res.end(); } catch { /* noop */ }
  });
}
