import { parseYouTubeUrl } from './sanitize.js';
import type { SourcePlatform } from '@shared/types';

export interface ParsedSourceUrl {
  valid: boolean;
  platform: SourcePlatform;
  kind: 'playlist' | 'video' | 'unknown';
  playlistId?: string;
  videoId?: string;
  normalized?: string;
  reason?: string;
}

/**
 * Route an arbitrary link to the right platform handler. Today that is YouTube
 * and Udemy; new platforms slot in here with their own parser.
 */
export function parseSourceUrl(raw: string): ParsedSourceUrl {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { valid: false, platform: 'youtube', kind: 'unknown', reason: 'Enter a URL to continue.' };

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return { valid: false, platform: 'youtube', kind: 'unknown', reason: 'That does not look like a valid URL.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { valid: false, platform: 'youtube', kind: 'unknown', reason: 'Only http(s) links are supported.' };
  }

  const host = url.hostname.toLowerCase();
  if (host === 'udemy.com' || host.endsWith('.udemy.com')) {
    return parseUdemyUrl(url);
  }

  const youtube = parseYouTubeUrl(trimmed);
  if (!youtube.valid) {
    const host = url.hostname.toLowerCase();
    const isYouTubeHost =
      host === 'youtube.com' || host.endsWith('youtube.com') ||
      host === 'youtu.be' || host.endsWith('youtu.be');
    return {
      valid: false,
      platform: 'youtube',
      kind: 'unknown',
      reason: isYouTubeHost
        ? youtube.reason
        : 'Only YouTube and Udemy links are supported right now.'
    };
  }
  return {
    valid: true,
    platform: 'youtube',
    kind: youtube.kind === 'playlist' ? 'playlist' : youtube.kind === 'channel' ? 'playlist' : 'video',
    playlistId: youtube.playlistId,
    videoId: youtube.videoId,
    normalized: youtube.normalized
  };
}

function parseUdemyUrl(url: URL): ParsedSourceUrl {
  const path = url.pathname.replace(/\/+$/, '');
  const courseMatch = path.match(/^\/course\/([^/]+)/);
  if (!courseMatch) {
    return {
      valid: false,
      platform: 'udemy',
      kind: 'unknown',
      reason: 'That Udemy link is not a course or lecture URL.'
    };
  }
  const slug = courseMatch[1];

  const lectureMatch = path.match(/\/learn\/(?:v\d+\/t\/)?lecture\/(\d+)$/);
  if (lectureMatch) {
    return {
      valid: true,
      platform: 'udemy',
      kind: 'video',
      videoId: lectureMatch[1],
      normalized: `https://www.udemy.com/course/${slug}/learn/lecture/${lectureMatch[1]}`
    };
  }

  return {
    valid: true,
    platform: 'udemy',
    kind: 'playlist',
    playlistId: slug,
    normalized: `https://www.udemy.com/course/${slug}/`
  };
}
