import path from 'node:path';

/**
 * Characters Windows forbids in file names, plus control characters.
 *
 * The control-character range is intentional: scraped video titles can contain
 * newlines and NUL bytes, and stripping them is the whole point of this regex.
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

/** Device names Windows reserves regardless of extension. */
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

/**
 * Turn an arbitrary video/playlist title into a safe file-system name.
 * Never returns an empty string and never returns a reserved device name.
 */
export function sanitizeFilename(input: string, maxLength = 120): string {
  let name = (input ?? '')
    .normalize('NFC')
    .replace(ILLEGAL_CHARS, ' ')
    // Collapse whitespace runs, including newlines from scraped titles.
    .replace(/\s+/g, ' ')
    .trim()
    // Windows silently strips trailing dots and spaces; do it explicitly.
    .replace(/[. ]+$/g, '');

  if (name.length > maxLength) {
    name = name.slice(0, maxLength).replace(/[. ]+$/g, '');
  }

  if (!name) name = 'untitled';

  const stem = name.split('.')[0]?.toUpperCase() ?? '';
  if (RESERVED_NAMES.has(stem)) name = `_${name}`;

  return name;
}

/** Zero-pad a playlist index so files sort correctly in Explorer. */
export function padIndex(index: number, total: number): string {
  const width = Math.max(2, String(Math.max(total, 1)).length);
  return String(index).padStart(width, '0');
}

/**
 * Guard against path traversal: resolves `candidate` and asserts it stays
 * inside `root`. Returns the resolved absolute path.
 */
export function resolveWithin(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside of the destination folder: ${candidate}`);
  }
  return resolved;
}

/**
 * Blocked destination roots, written with forward slashes. Checked against
 * both the raw and the resolved path so the rule holds even when a Windows
 * path is evaluated on a non-Windows host (e.g. in tests or CI).
 */
const BLOCKED_ROOTS = [
  'c:/windows',
  'c:/program files',
  'c:/program files (x86)',
  'c:/programdata',
  '/etc',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/system',
  '/library'
];

/** Normalise separators and case so prefix comparisons are reliable. */
function normalizeForCompare(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** True when a destination path is plausible and not a protected system location. */
export function isSafeDestination(dir: string): boolean {
  if (!dir || typeof dir !== 'string' || !dir.trim()) return false;

  // Compare the literal input and the host-resolved form; either matching a
  // protected root is enough to reject.
  const candidates = [normalizeForCompare(dir.trim()), normalizeForCompare(path.resolve(dir.trim()))];

  return !candidates.some((candidate) =>
    BLOCKED_ROOTS.some((root) => candidate === root || candidate.startsWith(`${root}/`))
  );
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be'
]);

export interface ParsedYouTubeUrl {
  valid: boolean;
  kind: 'playlist' | 'video' | 'channel' | 'unknown';
  playlistId?: string;
  videoId?: string;
  normalized?: string;
  reason?: string;
}

/**
 * Validate and normalise a user-supplied URL. We only ever hand normalised
 * URLs to yt-dlp so that shell-ish or file:// inputs can never reach it.
 */
export function parseYouTubeUrl(raw: string): ParsedYouTubeUrl {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { valid: false, kind: 'unknown', reason: 'Enter a URL to continue.' };

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return { valid: false, kind: 'unknown', reason: 'That does not look like a valid URL.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { valid: false, kind: 'unknown', reason: 'Only http(s) links are supported.' };
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return { valid: false, kind: 'unknown', reason: 'Only YouTube links are supported right now.' };
  }

  const listId = url.searchParams.get('list');
  if (listId && /^[A-Za-z0-9_-]{2,64}$/.test(listId)) {
    return {
      valid: true,
      kind: 'playlist',
      playlistId: listId,
      normalized: `https://www.youtube.com/playlist?list=${listId}`
    };
  }

  let videoId: string | null = null;
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    videoId = url.pathname.slice(1);
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v');
  } else if (url.pathname.startsWith('/shorts/')) {
    videoId = url.pathname.split('/')[2] ?? null;
  }

  if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return {
      valid: true,
      kind: 'video',
      videoId,
      normalized: `https://www.youtube.com/watch?v=${videoId}`
    };
  }

  if (/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+)/.test(url.pathname)) {
    return {
      valid: true,
      kind: 'channel',
      normalized: `https://www.youtube.com${url.pathname}`
    };
  }

  return { valid: false, kind: 'unknown', reason: 'No playlist or video was found in that link.' };
}
