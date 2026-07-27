import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import readline from 'node:readline';
import { resolveBinaries } from '../ffmpeg/binaries.js';

/** yt-dlp is spawned with stdin ignored and both output streams piped. */
type YtDlpProcess = ChildProcessByStdio<null, Readable, Readable>;

export interface SpawnHandle {
  child: YtDlpProcess;
  done: Promise<{ code: number | null; stderr: string }>;
  kill: (signal?: NodeJS.Signals) => void;
}

export interface RunOptions {
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  signal?: AbortSignal;
  cwd?: string;
}

/**
 * Spawn yt-dlp with an explicit argv array.
 *
 * Security: `shell` is always false, so nothing in a video title, URL or
 * destination path can ever be interpreted by cmd.exe. Every argument is
 * passed as a discrete array element.
 */
export function runYtDlp(args: string[], options: RunOptions = {}): SpawnHandle {
  const { ytDlp } = resolveBinaries();

  const child = spawn(ytDlp, args, {
    shell: false,
    windowsHide: true,
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  }) as YtDlpProcess;

  let stderrBuffer = '';

  if (options.onStdoutLine) {
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => options.onStdoutLine?.(line));
  } else {
    child.stdout.resume();
  }

  const errRl = readline.createInterface({ input: child.stderr });
  errRl.on('line', (line) => {
    // Keep the tail only: some failures emit megabytes of warnings.
    stderrBuffer = `${stderrBuffer}${line}\n`.slice(-8000);
    options.onStderrLine?.(line);
  });

  const done = new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ code, stderr: stderrBuffer }));
  });

  const kill = (signal: NodeJS.Signals = 'SIGTERM') => {
    if (child.killed || child.exitCode !== null) return;
    if (process.platform === 'win32') {
      // SIGTERM is not really supported on Windows; kill the tree.
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore'
      });
    } else {
      child.kill(signal);
    }
  };

  options.signal?.addEventListener('abort', () => kill(), { once: true });

  return { child, done, kill };
}

/** Collect the whole stdout of a yt-dlp invocation (used for JSON dumps). */
export function runYtDlpCollect(
  args: string[],
  options: RunOptions = {}
): { promise: Promise<string>; kill: () => void } {
  const lines: string[] = [];
  const handle = runYtDlp(args, {
    ...options,
    onStdoutLine: (line) => {
      lines.push(line);
      options.onStdoutLine?.(line);
    }
  });

  const promise = handle.done.then(({ code, stderr }) => {
    if (code !== 0) {
      throw new Error(humanizeYtDlpError(stderr, code));
    }
    return lines.join('\n');
  });

  return { promise, kill: () => handle.kill() };
}

/** Translate yt-dlp's stderr into something a normal person can act on. */
export function humanizeYtDlpError(stderr: string, code: number | null): string {
  const text = (stderr || '').toLowerCase();

  if (text.includes('enoent') || text.includes('not recognized')) {
    return 'yt-dlp was not found. Open Settings → Dependencies to install or locate it.';
  }
  if (text.includes('private video') || text.includes('this playlist is private')) {
    return 'This playlist is private, so its contents cannot be read.';
  }
  if (text.includes('members-only') || text.includes('join this channel')) {
    return 'This content is members-only and cannot be downloaded.';
  }
  if (text.includes('video unavailable') || text.includes('does not exist')) {
    return 'The video or playlist is unavailable or has been removed.';
  }
  if (text.includes('sign in to confirm your age') || text.includes('age-restricted')) {
    return 'This content is age-restricted and requires a signed-in session.';
  }
  if (text.includes('sign in to confirm') || text.includes('not a bot')) {
    return 'YouTube asked for verification. Try again shortly, or update yt-dlp.';
  }
  if (text.includes('http error 429') || text.includes('too many requests')) {
    return 'YouTube is rate-limiting this connection. Wait a few minutes and retry.';
  }
  if (text.includes('unable to download webpage') || text.includes('getaddrinfo') || text.includes('network')) {
    return 'Network error — check your internet connection and try again.';
  }
  if (text.includes('no space left') || text.includes('enospc')) {
    return 'The destination drive is out of free space.';
  }
  if (text.includes('permission denied') || text.includes('eacces') || text.includes('eperm')) {
    return 'Permission denied writing to the destination folder. Pick another folder.';
  }
  if (text.includes('ffmpeg')) {
    return 'FFmpeg failed while merging. Open Settings → Dependencies to verify your FFmpeg install.';
  }

  const lastLine = (stderr || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR:'))
    .pop();

  if (lastLine) return lastLine.replace(/^ERROR:\s*/, '');
  return `Download failed (exit code ${code ?? 'unknown'}).`;
}
