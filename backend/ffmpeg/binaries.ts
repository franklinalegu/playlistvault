import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import type { BinaryStatus } from '@shared/types';

const execFileAsync = promisify(execFile);

export interface BinaryPaths {
  ytDlp: string;
  ffmpeg: string;
  ffprobe: string;
}

export interface RuntimePaths { node: string; }

let cached: BinaryPaths | null = null;
let overrides: Partial<BinaryPaths> = {};
let userDataDir: string | null = null;

/**
 * Where user-installed tools live. Set from the main process to Electron's
 * userData path; falls back to the home directory outside Electron (tests).
 */
export function setUserDataDir(dir: string): void {
  userDataDir = dir;
  cached = null;
}

export function getUserBinDir(): string {
  const base = userDataDir ?? path.join(os.homedir(), '.playlistvault');
  return path.join(base, 'bin');
}

/** Force re-resolution after tools are installed or replaced. */
export function clearBinaryCache(): void {
  cached = null;
}

export function setBinaryOverrides(next: { ytDlpPath?: string; ffmpegPath?: string }): void {
  overrides = {
    ytDlp: next.ytDlpPath || undefined,
    ffmpeg: next.ffmpegPath || undefined
  };
  cached = null;
}

function exeName(base: string): string {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

/** Directories we search, most specific first. */
function candidateDirs(): string[] {
  const dirs: string[] = [];
  // Tools installed at first run take priority: they are the newest copy and
  // can be refreshed without reinstalling the app.
  dirs.push(getUserBinDir());
  // Packaged app: resources/bin next to the executable.
  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, 'bin'));
  }
  // Development fallback: repo-local resources/bin populated by scripts/fetch-binaries.mjs.
  // Only add when not packaged — in a packaged Electron app process.cwd() is
  // not the repo root and would be misleading in diagnostics.
  const isPackaged = Boolean(process.resourcesPath && !process.resourcesPath.includes('node_modules'));
  // Also guard that the dev dir actually exists to avoid noisy ENOENT checks.
  const devBin = path.resolve(process.cwd(), 'resources', 'bin');
  try {
    if (!isPackaged && fs.existsSync(devBin)) dirs.push(devBin);
  } catch { /* ignore */ }
  dirs.push(path.join(os.homedir(), '.playlistvault', 'bin'));
  return dirs;
}

function findOnDisk(base: string): string | undefined {
  const file = exeName(base);
  for (const dir of candidateDirs()) {
    const full = path.join(dir, file);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    } catch {
      /* keep searching */
    }
  }
  return undefined;
}

function findNodeRuntime(): string {
  // Bundled runtime: packaged bin or dev bin (only when not packaged).
  const bundled: string[] = [];
  if (process.resourcesPath) {
    bundled.push(path.join(process.resourcesPath, 'bin', exeName('node')));
  } else {
    const devNode = path.resolve(process.cwd(), 'resources', 'bin', exeName('node'));
    try { if (fs.existsSync(devNode)) bundled.push(devNode); } catch { /* ignore */ }
  }
  const candidates = process.platform === 'win32'
    ? [
        ...bundled,
        path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe'),
        path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nodejs', 'node.exe')
      ]
    : [...bundled, '/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node'];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch { /* keep searching */ }
  }
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

export function resolveJavaScriptRuntime(): RuntimePaths {
  return { node: findNodeRuntime() };
}

/**
 * Resolve binaries. We prefer a bundled copy so the app works offline and is
 * not affected by whatever is on the user's PATH; falling back to the bare
 * command name lets power users rely on a system install.
 */
export function resolveBinaries(): BinaryPaths {
  if (cached) return cached;
  cached = {
    ytDlp: overrides.ytDlp || findOnDisk('yt-dlp') || exeName('yt-dlp'),
    ffmpeg: overrides.ffmpeg || findOnDisk('ffmpeg') || exeName('ffmpeg'),
    ffprobe: findOnDisk('ffprobe') || exeName('ffprobe')
  };
  return cached;
}

async function probe(name: 'yt-dlp' | 'ffmpeg', bin: string, args: string[]): Promise<BinaryStatus> {
  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    const first = stdout.split('\n')[0]?.trim() ?? '';
    return { name, found: true, path: bin, version: first };
  } catch (error) {
    return {
      name,
      found: false,
      path: bin,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function checkBinaries(): Promise<BinaryStatus[]> {
  const bins = resolveBinaries();
  return Promise.all([
    probe('yt-dlp', bins.ytDlp, ['--version']),
    probe('ffmpeg', bins.ffmpeg, ['-version'])
  ]);
}
