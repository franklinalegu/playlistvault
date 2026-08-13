import type { BrowserCookieSource, DownloadOptions, ProxyConfig, VideoQuality } from '@shared/types';
import { resolveJavaScriptRuntime } from '../ffmpeg/binaries.js';

const HEIGHT_BY_QUALITY: Record<Exclude<VideoQuality, 'best' | 'audio-only'>, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360
};

/**
 * Build a yt-dlp `-f` selector.
 *
 * We prefer separate video+audio streams (higher quality ceiling) but always
 * provide a progressive fallback so a download never hard-fails just because
 * the ideal combination is missing.
 */
export function buildFormatSelector(options: DownloadOptions): string {
  if (options.audioOnly || options.quality === 'audio-only') {
    return 'bestaudio/best';
  }

  if (options.quality === 'best') {
    return 'bv*+ba/b';
  }

  const height = HEIGHT_BY_QUALITY[options.quality as keyof typeof HEIGHT_BY_QUALITY] ?? 1080;

  // mp4 output benefits from avc1+m4a which never needs a re-encode.
  if (options.container === 'mp4') {
    return [
      `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]`,
      `bv*[height<=${height}]+ba`,
      `b[height<=${height}]`,
      'bv*+ba/b'
    ].join('/');
  }

  return [`bv*[height<=${height}]+ba`, `b[height<=${height}]`, 'bv*+ba/b'].join('/');
}

/** Full argv for downloading one video. Never interpolated into a shell. */
export function buildDownloadArgs(params: {
  url: string;
  outputTemplate: string;
  options: DownloadOptions;
  ffmpegPath: string;
  browserCookieSource?: BrowserCookieSource;
  proxy?: ProxyConfig;
  globalSpeedLimitKbps?: number;
}): string[] {
  const {
    url,
    outputTemplate,
    options,
    ffmpegPath,
    browserCookieSource = 'none',
    proxy,
    globalSpeedLimitKbps = 0
  } = params;

  const args: string[] = [
    '--no-playlist',
    '--newline',
    '--progress',
    '--no-colors',
    '--no-warnings',
    '--ignore-config',
    '--no-mtime',
    '--retries', '5',
    '--fragment-retries', '10',
    '--socket-timeout', '30',
    '--concurrent-fragments', '4',
    '--ffmpeg-location', ffmpegPath,
    '--output', outputTemplate,
    '--format', buildFormatSelector(options)
  ];

  addYouTubeRuntimeArgs(args);
  if (browserCookieSource !== 'none') args.push('--cookies-from-browser', browserCookieSource);

  // Speed limiting: prefer per-job setting, fall back to global
  const effectiveSpeedLimit = options.speedLimitKbps || globalSpeedLimitKbps;
  if (effectiveSpeedLimit && effectiveSpeedLimit > 0) {
    args.push('--limit-rate', `${effectiveSpeedLimit}K`);
  } else if (options.rateLimitKbps && options.rateLimitKbps > 0) {
    args.push('--limit-rate', `${options.rateLimitKbps}K`);
  }

  // Proxy support
  if (proxy?.enabled && proxy.host && proxy.port) {
    const proxyUrl = `${proxy.type}://${proxy.host}:${proxy.port}`;
    args.push('--proxy', proxyUrl);
  }

  if (options.audioOnly || options.quality === 'audio-only') {
    args.push('--extract-audio', '--audio-format', options.audioFormat, '--audio-quality', '0');
  } else {
    args.push('--merge-output-format', options.container);
  }

  if (options.embedThumbnail) {
    args.push('--embed-thumbnail');
  }

  if (options.writeSubtitles && !options.audioOnly) {
    const langs = options.subtitleLanguages.length ? options.subtitleLanguages.join(',') : 'en';
    args.push('--write-subs', '--write-auto-subs', '--sub-langs', langs, '--embed-subs');
  }

  // Metadata is cheap and makes the offline library far nicer to browse.
  args.push('--embed-metadata');

  // The info JSON carries the full description, chapters and channel URL,
  // which is what the resource manifest is built from. It is deleted again
  // once the manifest has absorbed it.
  if (options.writeResourceManifest) {
    args.push('--write-info-json');
  }

  args.push(url);
  return args;
}

/** Argv for dumping playlist metadata as newline-delimited JSON. */
export function buildAnalyzeArgs(url: string, browserCookieSource: BrowserCookieSource = 'none', proxy?: ProxyConfig): string[] {
  const args = [
    '--dump-single-json',
    '--flat-playlist',
    '--ignore-config',
    '--no-warnings',
    '--no-colors',
    '--socket-timeout', '30',
    '--retries', '3',
  ];
  addYouTubeRuntimeArgs(args);
  if (browserCookieSource !== 'none') args.push('--cookies-from-browser', browserCookieSource);
  if (proxy?.enabled && proxy.host && proxy.port) {
    const proxyUrl = `${proxy.type}://${proxy.host}:${proxy.port}`;
    args.push('--proxy', proxyUrl);
  }
  args.push(url);
  return args;
}

export function buildFormatProbeArgs(
  url: string,
  browserCookieSource: BrowserCookieSource = 'none'
): string[] {
  const args = [
    '--list-formats', '--no-playlist', '--ignore-config', '--no-warnings', '--no-colors',
    '--socket-timeout', '30', '--retries', '1'
  ];
  addYouTubeRuntimeArgs(args);
  if (browserCookieSource !== 'none') args.push('--cookies-from-browser', browserCookieSource);
  args.push(url);
  return args;
}

function addYouTubeRuntimeArgs(args: string[]): void {
  args.push('--js-runtimes', `node:${resolveJavaScriptRuntime().node}`, '--remote-components', 'ejs:github');
}
