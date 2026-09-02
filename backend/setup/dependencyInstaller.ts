import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import type { DependencyName, DependencyProgress } from '@shared/types';
import { getUserBinDir, clearBinaryCache } from '../ffmpeg/binaries.js';

const YTDLP_URL_WIN = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const YTDLP_URL_NIX = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

// Keep Windows filename case-insensitive but validate after download
const MIN_YTDLP_BYTES = 8_000_000; // yt-dlp.exe is ~18 MB; anything <8 MB is an HTML error page

/**
 * FFmpeg "essentials" build. Only ffmpeg.exe and ffprobe.exe are kept; the
 * archive also contains ffplay and docs which we discard to save ~90 MB.
 */
const FFMPEG_ZIP_WIN =
  'https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip';
const FFMPEG_ZIP_WIN_FALLBACK =
  'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';
const FFMPEG_ZIP_MAC = 'https://evermeet.cx/ffmpeg/getrelease/zip';

export type ProgressReporter = (progress: DependencyProgress) => void;

/**
 * Downloads the external tools into the per-user data folder.
 *
 * They deliberately do NOT ship inside the installer: FFmpeg alone is ~175 MB
 * unpacked, which would triple the download size. Installing them here also
 * means yt-dlp can be refreshed without reinstalling the whole app.
 */
export async function installDependency(
  name: DependencyName,
  report: ProgressReporter
): Promise<string> {
  const binDir = getUserBinDir();
  await fsp.mkdir(binDir, { recursive: true });

  try {
    const result =
      name === 'yt-dlp'
        ? await installYtDlp(binDir, report)
        : await installFfmpeg(binDir, report);

    clearBinaryCache();
    report({ name, stage: 'done', percent: 100, message: 'Installed' });
    return result;
  } catch (error) {
    const message = describeError(error);
    report({ name, stage: 'error', percent: 0, message });
    throw new Error(message);
  }
}

async function installYtDlp(binDir: string, report: ProgressReporter): Promise<string> {
  const isWin = process.platform === 'win32';
  const target = path.join(binDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');
  const tmp = `${target}.download`;

  report({ name: 'yt-dlp', stage: 'downloading', percent: 0, message: 'Contacting GitHub…' });
  await download(isWin ? YTDLP_URL_WIN : YTDLP_URL_NIX, tmp, (percent, detail) =>
    report({ name: 'yt-dlp', stage: 'downloading', percent, message: detail })
  );

  // Validate: GitHub returns an HTML page on rate-limit/404 — detect by size and header sniff
  try {
    const stat = await fsp.stat(tmp);
    if (stat.size < MIN_YTDLP_BYTES) {
      const head = (await fsp.readFile(tmp, 'utf-8').catch(() => '')).slice(0, 800).toLowerCase();
      if (head.includes('<!doctype') || head.includes('<html') || head.includes('rate limit') || head.includes('not found')) {
        await fsp.rm(tmp, { force: true }).catch(() => undefined);
        throw new Error(
          'GitHub returned an error page instead of yt-dlp (rate-limited or network issue). Wait a minute and retry, or download manually from https://github.com/yt-dlp/yt-dlp/releases/latest and place yt-dlp.exe in the app data folder.'
        );
      }
      if (stat.size < MIN_YTDLP_BYTES) {
        await fsp.rm(tmp, { force: true }).catch(() => undefined);
        throw new Error(
          `Downloaded yt-dlp looks truncated (${(stat.size / 1024).toFixed(0)} KB). The download was interrupted — retry.`
        );
      }
    }
  } catch (e) {
    if (e instanceof Error && /GitHub returned|truncated/i.test(e.message)) throw e;
    // stat failed — let replaceFile/download error surface
  }

  // Antivirus often deletes the file between download and move — verify it still exists
  if (!fs.existsSync(tmp)) {
    throw new Error(
      'yt-dlp was removed after download (likely antivirus quarantine). Allow yt-dlp.exe in Windows Security → Protection history, then retry.'
    );
  }

  await replaceFile(tmp, target);
  if (!isWin) await fsp.chmod(target, 0o755);

  // Post-install sanity: the file should exist and be non-empty
  try {
    const after = await fsp.stat(target);
    if (after.size === 0) throw new Error('installed file is 0 bytes');
  } catch {
    throw new Error(
      'yt-dlp install appears to have been blocked (file missing or empty after move). Check antivirus quarantine and retry.'
    );
  }

  return target;
}

async function installFfmpeg(binDir: string, report: ProgressReporter): Promise<string> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    throw new Error(
      'Automatic FFmpeg install is only supported on Windows and macOS. Install it with your package manager instead.'
    );
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'playlistvault-ffmpeg-'));
  const zipPath = path.join(tmpDir, 'ffmpeg.zip');

  try {
    report({ name: 'ffmpeg', stage: 'downloading', percent: 0, message: 'Contacting server…' });
    let downloaded = false;
    let lastErr: unknown = null;
    const candidates =
      process.platform === 'win32' ? [FFMPEG_ZIP_WIN, FFMPEG_ZIP_WIN_FALLBACK] : [FFMPEG_ZIP_MAC];
    for (const url of candidates) {
      try {
        await download(url, zipPath, (percent, detail) =>
          report({ name: 'ffmpeg', stage: 'downloading', percent, message: detail })
        );
        downloaded = true;
        break;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        // 404 on Gyan build happens when the 7.1 tag is gone — try fallback immediately
        if (/Server returned 404/i.test(msg) && url === FFMPEG_ZIP_WIN) continue;
        if (candidates.indexOf(url) === candidates.length - 1) throw e;
      }
    }
    if (!downloaded) throw lastErr ?? new Error('FFmpeg download failed');

    // Validate zip is not an HTML error page
    const zipStat = await fsp.stat(zipPath).catch(() => null);
    if (zipStat && zipStat.size < 1_000_000) {
      const head = (await fsp.readFile(zipPath, 'utf-8').catch(() => '')).slice(0, 900).toLowerCase();
      if (head.includes('<!doctype') || head.includes('<html') || head.includes('not found')) {
        throw new Error(
          'FFmpeg server returned an error page. Try again in a minute, or download manually from https://ffmpeg.org/download.html and place ffmpeg.exe/ffprobe.exe in the app data folder.'
        );
      }
    }

    report({ name: 'ffmpeg', stage: 'extracting', percent: 100, message: 'Extracting…' });

    const zip = new AdmZip(zipPath);
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const wanted = [`ffmpeg${suffix}`, `ffprobe${suffix}`];
    let extracted = 0;

    for (const entry of zip.getEntries()) {
      const base = path.basename(entry.entryName).toLowerCase();
      if (entry.isDirectory || !wanted.includes(base)) continue;

      const tmpOut = path.join(tmpDir, base);
      await fsp.writeFile(tmpOut, entry.getData());
      await replaceFile(tmpOut, path.join(binDir, base));
      if (process.platform !== 'win32') await fsp.chmod(path.join(binDir, base), 0o755);
      extracted += 1;
    }

    if (extracted < wanted.length) {
      throw new Error('The FFmpeg archive did not contain the expected programs. Try the fallback or install manually.');
    }

    return path.join(binDir, `ffmpeg${suffix}`);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Move a freshly downloaded file into place. On Windows a running executable
 * cannot be overwritten, so the old copy is renamed aside first.
 */
async function replaceFile(from: string, to: string): Promise<void> {
  if (fs.existsSync(to)) {
    const stale = `${to}.old-${Date.now()}`;
    try {
      await fsp.rename(to, stale);
      await fsp.rm(stale, { force: true }).catch(() => undefined);
    } catch {
      // Locked by a running process — remove what we downloaded and report.
      await fsp.rm(from, { force: true }).catch(() => undefined);
      throw new Error(
        `${path.basename(to)} is currently in use. Close any running downloads and try again.`
      );
    }
  }
  await fsp.rename(from, to);
}

async function download(
  url: string,
  target: string,
  onProgress: (percent: number, detail: string) => void
): Promise<void> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'PlaylistVault/5.2 dependency-installer' }
      });
      if (!response.ok || !response.body) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`);
      }

      const totalBytes = Number(response.headers.get('content-length') ?? 0);
      let received = 0;
      let lastReport = 0;

      const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

      source.on('data', (chunk: Buffer) => {
        received += chunk.length;
        const now = Date.now();
        // Throttle so the IPC channel isn't flooded on a fast connection.
        if (now - lastReport < 200) return;
        lastReport = now;

        const percent = totalBytes > 0 ? Math.min(99, (received / totalBytes) * 100) : 0;
        onProgress(percent, formatProgress(received, totalBytes));
      });

      await pipeline(source, fs.createWriteStream(target));
      onProgress(100, formatProgress(received, totalBytes || received));
      return;
    } catch (error) {
      lastError = error;
      // Clean partial file before retry
      await fsp.rm(target, { force: true }).catch(() => undefined);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const msg = error instanceof Error ? error.message : String(error);
      const retryable = isAbort || /fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ENETUNREACH|ECONNRESET|Server returned 5\d\d/i.test(msg);
      if (!retryable || attempt === maxAttempts) break;
      const backoff = 1000 * attempt;
      await new Promise((r) => setTimeout(r, backoff));
      onProgress(0, `Retrying (${attempt}/${maxAttempts - 1})…`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function formatProgress(received: number, total: number): string {
  const mb = (n: number): string => (n / 1024 / 1024).toFixed(1);
  return total > 0 ? `${mb(received)} MB of ${mb(total)} MB` : `${mb(received)} MB`;
}

function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // Preserve already-humanized messages (they contain guidance)
  if (/quarantine|manually from https|Allow it in Windows Security|truncated|rate-limit/i.test(raw)) return raw;
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|ENETUNREACH/i.test(raw)) {
    return 'Could not reach the download server. Check your internet connection and try again. If corporate firewall blocks GitHub, download manually (links in Settings → Dependencies).';
  }
  if (/Server returned 403/i.test(raw)) {
    return 'Download blocked (403). GitHub may be rate-limiting — wait 60s and retry, or download manually from the link in Settings → Dependencies.';
  }
  if (/Server returned 404/i.test(raw)) {
    return 'Download not found (404). The release may have moved — retry to use the fallback, or download manually.';
  }
  if (/Server returned 429/i.test(raw)) {
    return 'Too many requests (429). Wait a minute and retry.';
  }
  if (/ETIMEDOUT|timeout|AbortError/i.test(raw)) {
    return 'The download timed out. Check your connection and try again.';
  }
  if (/ENOSPC/i.test(raw)) {
    return 'Not enough free disk space to install this component.';
  }
  if (/EACCES|EPERM/i.test(raw)) {
    return 'Permission denied writing to the app data folder. Try running as administrator or pick a folder inside your user profile.';
  }
  if (/EBUSY|in use/i.test(raw)) {
    return raw; // already friendly from replaceFile
  }
  return raw;
}
