#!/usr/bin/env node
/**
 * Downloads the yt-dlp and FFmpeg binaries into resources/bin so the packaged
 * app is fully self-contained. Run once after `npm install`:
 *
 *   npm run fetch:binaries
 *
 * Existing files are left alone unless --force is passed.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');
const FORCE = process.argv.includes('--force');

/**
 * Skip the FFmpeg download.
 *
 * Release builds ship yt-dlp only and fetch FFmpeg on first run, which keeps
 * the installer at ~95 MB instead of ~144 MB. Local development still wants
 * both, so this is opt-in via `--no-ffmpeg`.
 */
const SKIP_FFMPEG = process.argv.includes('--no-ffmpeg');
const isWindows = process.platform === 'win32';

const YTDLP_URL = isWindows
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

const FFMPEG_ZIP =
  'https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip';

async function main() {
  await fsp.mkdir(BIN_DIR, { recursive: true });
  console.log(`→ Target: ${BIN_DIR}\n`);

  await fetchYtDlp();
  if (SKIP_FFMPEG) {
    console.log('• FFmpeg: skipped (--no-ffmpeg). The app downloads it on first run.');
  } else if (isWindows) {
    await fetchFfmpegWindows();
  } else {
    console.log('• FFmpeg: skipping automatic download on this platform.');
    console.log('  Install it with your package manager (e.g. `apt install ffmpeg`)');
    console.log('  or copy ffmpeg/ffprobe into resources/bin manually.\n');
  }

  console.log('\n✓ Done. Run `npm run dev` to start the app.');
}

async function fetchYtDlp() {
  const target = path.join(BIN_DIR, isWindows ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(target) && !FORCE) {
    console.log('• yt-dlp: already present (use --force to re-download)');
    return;
  }
  console.log('• yt-dlp: downloading latest release…');
  await download(YTDLP_URL, target);
  if (!isWindows) await fsp.chmod(target, 0o755);
  console.log('  ✓ yt-dlp ready');
}

async function fetchFfmpegWindows() {
  const target = path.join(BIN_DIR, 'ffmpeg.exe');
  if (fs.existsSync(target) && !FORCE) {
    console.log('• FFmpeg: already present (use --force to re-download)');
    return;
  }

  console.log('• FFmpeg: downloading essentials build (~30 MB)…');
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pv-ffmpeg-'));
  const zipPath = path.join(tmpDir, 'ffmpeg.zip');

  try {
    await download(FFMPEG_ZIP, zipPath);
    console.log('  extracting…');

    // PowerShell's Expand-Archive avoids adding a zip dependency.
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${tmpDir}" -Force`],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
    );

    for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
      const found = findFile(tmpDir, name);
      if (!found) throw new Error(`${name} was not found inside the archive`);
      await fsp.copyFile(found, path.join(BIN_DIR, name));
    }
    console.log('  ✓ FFmpeg + FFprobe ready');
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

function findFile(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(full, filename);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return full;
    }
  }
  return null;
}

async function download(url, target, redirects = 0) {
  if (redirects > 6) throw new Error('Too many redirects');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(target));
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  if (error.cause) console.error(`  cause: ${error.cause}`);
  console.error('\nYou can also install the binaries manually:');
  console.error('  1. yt-dlp:  https://github.com/yt-dlp/yt-dlp/releases');
  console.error('  2. FFmpeg:  https://www.gyan.dev/ffmpeg/builds/');
  console.error(`  3. Place the .exe files in ${BIN_DIR}`);
  process.exit(1);
});
