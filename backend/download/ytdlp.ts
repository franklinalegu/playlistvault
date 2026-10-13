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
      // Guard against spawn failure where pid is undefined.
      if (!child.pid) return;
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

  const attemptOnce = (): Promise<string> =>
    handle.done
      .then(({ code, stderr }) => {
        if (code !== 0) {
          throw new Error(humanizeYtDlpError(stderr, code));
        }
        return lines.join('\n');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        // Spawn failures (ENOENT etc.) reject instead of resolving — humanize them too.
        // Already-humanized messages (thrown above) pass through untouched so
        // the EBUSY/crash-code guidance is never double-wrapped.
        if (/currently in use or locked|crashed on launch|could not be launched|was not found|quarantine|corrupted|Permission denied/i.test(msg)) {
          throw err;
        }
        throw new Error(humanizeYtDlpError(msg, -1));
      });

  // A lock (EBUSY) means the exe is being replaced by an update or held by
  // antivirus — transient. One delayed retry heals it without bothering the
  // user; anything else fails fast with the humanized message.
  const promise = attemptOnce().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/currently in use or locked/i.test(msg)) throw err;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const retryLines: string[] = [];
        try {
          const retry = runYtDlp(args, {
            ...options,
            onStdoutLine: (line) => {
              retryLines.push(line);
              options.onStdoutLine?.(line);
            }
          });
          retry.done
            .then(({ code, stderr }) => {
              if (code !== 0) reject(new Error(humanizeYtDlpError(stderr, code)));
              else resolve(retryLines.join('\n'));
            })
            .catch((e: unknown) => {
              const m = e instanceof Error ? e.message : String(e);
              reject(new Error(humanizeYtDlpError(m, -1)));
            });
        } catch (e) {
          reject(e);
        }
      }, 1500);
      options.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Cancelled.'));
      }, { once: true });
    });
  });

  return { promise, kill: () => handle.kill() };
}

/** Translate yt-dlp's stderr into something a normal person can act on. */
export function humanizeYtDlpError(stderr: string, code: number | null): string {
  // Windows often surfaces -1 as 4294967295 (0xFFFFFFFF unsigned). Normalize.
  const normalizedCode = code === 4294967295 ? -1 : code;
  const text = (stderr || '').toLowerCase();
  const hasStderr = text.trim().length > 0;

  // Spawn-level lock: the exe is being replaced (auto-update / manual
  // reinstall) or held open by antivirus. Transient — a retry a moment
  // later usually succeeds. This MUST come before the generic empty-stderr
  // branches so "spawn EBUSY" never surfaces as "failed to start".
  // NOTE: the message deliberately avoids the phrase "failed to start" so
  // downloadManager treats it as transient (retryable) rather than permanent.
  if (text.includes('ebusy') || text.includes('currently in use') || text.includes('resource busy')) {
    return 'yt-dlp is currently in use or locked (antivirus scan or background update in progress). Close any running downloads, wait a few seconds, then retry. If you just clicked Update yt-dlp, wait for it to finish first.';
  }

  // Windows crash codes: the process died before printing anything useful.
  // 3221225794 (0xC0000142 DLL_INIT_FAILED), 3221225477 (0xC0000005 access
  // violation), 3221225501 (illegal instruction) and 1073807364 are almost
  // always antivirus quarantine/corruption or a truncated download — not a
  // bad link. Seen in the wild Sept 2026 with parallel spawns.
  if (
    normalizedCode === 3221225794 ||
    normalizedCode === 3221225477 ||
    normalizedCode === 3221225501 ||
    normalizedCode === 1073807364 ||
    normalizedCode === -1073741502
  ) {
    return 'yt-dlp crashed on launch (Windows stopped the process). This is usually antivirus quarantine or a corrupted binary — not your link. Allow yt-dlp.exe in Windows Security → Protection history, reinstall it in Settings → Dependencies, then retry.';
  }

  // Empty stderr + non-zero exit (spawn killed / crashed) — raw Windows codes
  // are useless to users; give an actionable message (never the raw code).
  if (!hasStderr && normalizedCode !== 0 && normalizedCode !== null) {
    if (normalizedCode === -1) {
      return 'yt-dlp could not be launched. This usually means the binary is missing, blocked by antivirus, or crashed. Allow yt-dlp.exe in Windows Security → Protection history, reinstall it in Settings → Dependencies, then retry. If it persists, open the log file for details.';
    }
    return `yt-dlp exited unexpectedly (exit code ${normalizedCode}). Try updating yt-dlp in Settings → Dependencies and retry. If the link contains &list=, try it as a single video (remove &list=).`;
  }

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
  if (text.includes('sign in to confirm') || text.includes('not a bot') || text.includes('confirm you') && text.includes('are not a bot')) {
    return 'Browser sign-in required. In Settings, choose the browser where you are signed in (close that browser first), then retry.';
  }
  // Chrome cookie DB locked while browser is running — yt-dlp issue #7271
  if (text.includes('could not copy') && text.includes('cookie')) {
    return 'Could not read browser cookies — close the browser completely (check Task Manager for lingering chrome.exe) and retry, or export a cookies.txt file in Settings.';
  }
  if (text.includes('signature solving failed') || text.includes('n challenge solving failed') || text.includes('nsig') || text.includes('unable to extract') || text.includes('precondition check failed') || text.includes('only images are available') || text.includes('po token') || text.includes('visitor data')) {
    return 'YouTube signature verification could not run. Update yt-dlp in Settings → Dependencies and ensure Node.js 18+ is available, then retry. If bulk fails (0/N), update yt-dlp and retry the whole job.';
  }
  if (text.includes('http error 403') || text.includes('403: forbidden') || text.includes('http error 403: forbidden')) {
    return 'YouTube denied the request (HTTP 403). Update yt-dlp in Settings → Dependencies, then retry with a signed-in browser session (close the browser first).';
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
  if (
    text.includes('unsupported url') ||
    text.includes('no longer supports') ||
    text.includes('outdated version') ||
    text.includes('requires a newer version')
  ) {
    return 'yt-dlp is out of date and can no longer read this link. Update it in Settings → Dependencies.';
  }
  if (text.includes('udemy')) {
    if (text.includes('enroll') || text.includes('403') || text.includes('not purchased') || text.includes('not enrolled')) {
      return 'This Udemy course requires an active enrollment. Sign in with the account that purchased it, then retry.';
    }
    if (text.includes('log in') || text.includes('login') || text.includes('session') || text.includes('access token') || text.includes('authentication')) {
      return 'Udemy needs a signed-in session. Add a cookies.txt file or pick a signed-in browser in Settings, then retry.';
    }
    if (text.includes('cookies') && text.includes('unable to read')) {
      return 'The cookies.txt file could not be read. Check the path in Settings → Sign-in & platform access.';
    }
  }

  const lastLine = (stderr || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR:'))
    .pop();

  if (lastLine) return lastLine.replace(/^ERROR:\s*/, '');
  // EBUSY can also arrive with no ERROR: line (pure spawn failure) — check again on raw text.
  if (/ebusy|locked|currently in use/i.test(stderr || '')) {
    return 'yt-dlp is currently in use or locked (antivirus scan or background update in progress). Close any running downloads, wait a few seconds, then retry. If you just clicked Update yt-dlp, wait for it to finish first.';
  }
  // Fallback — never surface raw 4294967295 to users.
  if (normalizedCode === 4294967295 || normalizedCode === -1) {
    return 'yt-dlp could not be launched. This is usually antivirus holding yt-dlp.exe, a background update replacing it, or a corrupted download — not your link. Wait a few seconds and retry; if it persists, allow yt-dlp.exe in Windows Security → Protection history and reinstall it in Settings → Dependencies.';
  }
  return `Download failed (exit code ${normalizedCode ?? 'unknown'}). Try updating yt-dlp in Settings → Dependencies and check the log file for details.`;
}
