/**
 * File logger for PlaylistVault.
 *
 * A packaged Electron app has no visible stdout, so `console.error` output is
 * lost exactly when it matters — a user reporting "it didn't work". This
 * writes to a rotating file under the app's data folder that can be opened
 * from Settings and attached to a bug report.
 *
 * Deliberately dependency-free: the whole thing is ~150 lines and avoids
 * pulling another package into the installer.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Roll over at 2 MB and keep one previous file — plenty for diagnosis. */
const MAX_BYTES = 2 * 1024 * 1024;

let logFilePath: string | null = null;
let ready = false;
let minLevel: LogLevel = 'info';
let bytesWritten = 0;

/**
 * Patterns for values that must never reach disk.
 *
 * Logs get pasted into public issue trackers, so anything credential-shaped
 * is masked before it is written.
 */
const REDACTIONS: { re: RegExp; replace: string }[] = [
  { re: /gh[pousr]_[A-Za-z0-9]{16,}/g, replace: 'ghp_<redacted>' },
  { re: /github_pat_[A-Za-z0-9_]{20,}/g, replace: 'github_pat_<redacted>' },
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replace: '<email>' },
  // Cookies and auth headers can appear in yt-dlp stderr.
  { re: /(authorization|cookie|set-cookie)\s*[:=]\s*\S+/gi, replace: '$1: <redacted>' },
  { re: /([?&](?:key|token|access_token|api_key)=)[^&\s]+/gi, replace: '$1<redacted>' }
];

function redact(text: string): string {
  let out = text;
  for (const { re, replace } of REDACTIONS) out = out.replace(re, replace);
  return out;
}

/** Replace the user's home directory with ~ so logs don't leak a real name. */
function anonymizePaths(text: string): string {
  try {
    const home = os.homedir();
    if (!home) return text;
    return text.split(home).join('~');
  } catch {
    return text;
  }
}

function serialize(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Point the logger at a directory and open the file.
 * Safe to call more than once; later calls are ignored.
 */
export function initLogger(userDataPath: string, level: LogLevel = 'info'): string | null {
  if (ready) return logFilePath;

  minLevel = level;
  try {
    const dir = path.join(userDataPath, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, 'playlistvault.log');

    try {
      bytesWritten = fs.statSync(logFilePath).size;
    } catch {
      bytesWritten = 0;
    }

    rotateIfNeeded();
    // Touch the file so it exists even before the first message.
    fs.appendFileSync(logFilePath, '');
    ready = true;

    write('info', 'logger', `--- session started ${new Date().toISOString()} ---`);
    return logFilePath;
  } catch {
    logFilePath = null;
    ready = false;
    return null;
  }
}

function rotateIfNeeded(): void {
  if (!logFilePath || bytesWritten < MAX_BYTES) return;
  try {
    const previous = `${logFilePath}.1`;
    fs.rmSync(previous, { force: true });
    fs.renameSync(logFilePath, previous);
    bytesWritten = 0;
  } catch {
    /* keep appending if rotation fails */
  }
}

function write(level: LogLevel, scope: string, message: string): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const line = `${new Date().toISOString()} [${level.toUpperCase().padEnd(5)}] [${scope}] ${
    anonymizePaths(redact(message))
  }\n`;

  // Still echo to the console so `npm run dev` stays useful.
  if (level === 'error') console.error(line.trimEnd());
  else if (level === 'warn') console.warn(line.trimEnd());
  else console.log(line.trimEnd());

  if (!ready || !logFilePath) return;
  try {
    // Synchronous append: the log is written before a crash can lose it, and
    // there is no open handle holding the event loop open.
    fs.appendFileSync(logFilePath, line);
    bytesWritten += Buffer.byteLength(line);
    if (bytesWritten >= MAX_BYTES) rotateIfNeeded();
  } catch {
    /* never throw from logging */
  }
}

function make(level: LogLevel) {
  return (scope: string, ...parts: unknown[]): void =>
    write(level, scope, parts.map(serialize).join(' '));
}

export const log = {
  debug: make('debug'),
  info: make('info'),
  warn: make('warn'),
  error: make('error'),
  getPath: (): string | null => logFilePath,
  setLevel: (level: LogLevel): void => {
    minLevel = level;
  },
  /** Mark the logger closed. Writes are synchronous, so nothing is buffered. */
  close: (): void => {
    ready = false;
  }
};
