#!/usr/bin/env node
/**
 * Downloads the yt-dlp and FFmpeg binaries into resources/bin so the packaged
 * app is fully self-contained. Run once after `npm install`:
 *
 *   npm run fetch:binaries
 *
 * Existing files are left alone unless --force is passed. Use --arch x64 or
 * --arch arm64 when packaging for a different target than the current host.
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
const requestedArch = process.argv.find((arg) => arg.startsWith('--arch='))?.split('=')[1]
  ?? (process.argv.includes('--arch') ? process.argv[process.argv.indexOf('--arch') + 1] : undefined);
const arch = requestedArch === 'arm64' ? 'arm64' : requestedArch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'x64';

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
const NODE_VERSION = '22.14.0';

async function main() {
  await fsp.mkdir(BIN_DIR, { recursive: true });
  console.log(`→ Target: ${BIN_DIR}\n`);

  await fetchYtDlp();
  await fetchNodeRuntime();
  if (SKIP_FFMPEG) {
    console.log('• FFmpeg: skipped (--no-ffmpeg). The app downloads it on first run.');
  } else if (isWindows) {
    await fetchFfmpegWindows();
  } else if (process.platform === 'darwin') {
    await fetchFfmpegMac();
  } else {
    console.log('• FFmpeg: skipping automatic download on this platform.');
    console.log('  Install it with your package manager (e.g. `apt install ffmpeg`)');
    console.log('  or copy ffmpeg/ffprobe into resources/bin manually.\n');
  }

  console.log('\n✓ Done. Run `npm run dev` to start the app.');
}

async function fetchNodeRuntime() {
  const target = path.join(BIN_DIR, isWindows ? 'node.exe' : 'node');
  if (fs.existsSync(target) && !FORCE) {
    console.log('• Node.js runtime: already present (use --force to re-download)');
    return;
  }

  const archive = isWindows
    ? `node-v${NODE_VERSION}-win-${arch}.zip`
    : `node-v${NODE_VERSION}-darwin-${arch}.tar.gz`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archive}`;
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'playlistvault-node-'));
  const archivePath = path.join(tmpDir, archive);

  try {
    console.log(`• Node.js runtime: downloading ${NODE_VERSION} (${arch})…`);
    await download(url, archivePath);
    if (isWindows) {
      await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${tmpDir}" -Force`
      ], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    } else {
      await execFileAsync('tar', ['-xzf', archivePath, '-C', tmpDir]);
    }
    const found = findFile(tmpDir, isWindows ? 'node.exe' : 'node');
    if (!found) throw new Error('Node.js runtime was not found inside the archive');
    await fsp.copyFile(found, target);
    if (!isWindows) await fsp.chmod(target, 0o755);
    console.log('  ✓ Node.js runtime ready');
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
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

async function fetchFfmpegMac() {
  const targets = ['ffmpeg', 'ffprobe'];
  if (targets.every((name) => fs.existsSync(path.join(BIN_DIR, name))) && !FORCE) {
    console.log('• FFmpeg: already present (use --force to re-download)');
    return;
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'playlistvault-ffmpeg-'));
  try {
    console.log('• FFmpeg: downloading macOS builds…');
    const AdmZip = (await import('adm-zip')).default;
    for (const name of targets) {
      const zipPath = path.join(tmpDir, `${name}.zip`);
      await download(`https://evermeet.cx/ffmpeg/getrelease/${name}/zip`, zipPath);
      const zip = new AdmZip(zipPath);
      const entry = zip.getEntries().find((item) => path.basename(item.entryName) === name);
      if (!entry) throw new Error(`${name} was not found inside the macOS archive`);
      const target = path.join(BIN_DIR, name);
      await fsp.writeFile(target, entry.getData());
      await fsp.chmod(target, 0o755);
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
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'PlaylistVault build fetcher' },
        signal: AbortSignal.timeout(120_000)
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} fetching ${url}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(target));
      return;
    } catch (error) {
      lastError = error;
      await fsp.rm(target, { force: true });
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
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
