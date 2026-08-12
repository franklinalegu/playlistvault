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

/**
 * FFmpeg "essentials" build. Only ffmpeg.exe and ffprobe.exe are kept; the
 * archive also contains ffplay and docs which we discard to save ~90 MB.
 */
const FFMPEG_ZIP_WIN =
  'https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip';
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

  await replaceFile(tmp, target);
  if (!isWin) await fsp.chmod(target, 0o755);
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
    await download(process.platform === 'darwin' ? FFMPEG_ZIP_MAC : FFMPEG_ZIP_WIN, zipPath, (percent, detail) =>
      report({ name: 'ffmpeg', stage: 'downloading', percent, message: detail })
    );

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
      throw new Error('The FFmpeg archive did not contain the expected programs.');
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
  const response = await fetch(url, { redirect: 'follow' });
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
}

function formatProgress(received: number, total: number): string {
  const mb = (n: number): string => (n / 1024 / 1024).toFixed(1);
  return total > 0 ? `${mb(received)} MB of ${mb(total)} MB` : `${mb(received)} MB`;
}

function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|ENETUNREACH/i.test(raw)) {
    return 'Could not reach the download server. Check your internet connection and try again.';
  }
  if (/ETIMEDOUT|timeout/i.test(raw)) {
    return 'The download timed out. Check your connection and try again.';
  }
  if (/ENOSPC/i.test(raw)) {
    return 'Not enough free disk space to install this component.';
  }
  if (/EACCES|EPERM/i.test(raw)) {
    return 'Permission denied writing to the app data folder.';
  }
  return raw;
}
