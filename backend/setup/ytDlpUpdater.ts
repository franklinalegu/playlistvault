import type { YtDlpUpdateStatus } from '@shared/types';
import { checkBinaries } from '../ffmpeg/binaries.js';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const CACHE_TTL_MS = 60 * 60 * 1000;

let cachedLatest: { version: string; at: number } | null = null;

/**
 * Compare two yt-dlp version strings. yt-dlp versions are release dates in
 * YYYY.MM.DD form (nightly builds append a time suffix), so numeric part-wise
 * comparison is enough and never needs a package-manager lookup.
 */
export function compareYtDlpVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    (value.trim().match(/^\d{4}\.\d{2}\.\d{2}/)?.[0] ?? value.trim())
      .split('.')
      .map(Number);
  const partsA = parse(a);
  const partsB = parse(b);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Latest published yt-dlp release tag, cached for an hour. Returns null when
 * GitHub is unreachable so a network blip never blocks the app from starting.
 * Includes timeout and single retry to survive transient GitHub flakes.
 */
export async function getLatestYtDlpVersion(): Promise<string | null> {
  if (cachedLatest && Date.now() - cachedLatest.at < CACHE_TTL_MS) {
    return cachedLatest.version;
  }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'playlistvault' },
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { tag_name?: string };
      const tag = (data.tag_name ?? '').replace(/^v/, '');
      if (!/^\d{4}\.\d{2}\.\d{2}/.test(tag)) return null;
      cachedLatest = { version: tag, at: Date.now() };
      return tag;
    } catch {
      if (attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
}

/** Compare the installed yt-dlp against the latest release. */
export async function checkYtDlpUpdate(): Promise<YtDlpUpdateStatus> {
  const [bins, latest] = await Promise.all([checkBinaries(), getLatestYtDlpVersion()]);
  const current = bins.find((b) => b.name === 'yt-dlp')?.version ?? null;
  if (!current || !latest) return { current, latest, outdated: false };
  return { current, latest, outdated: compareYtDlpVersions(latest, current) > 0 };
}
