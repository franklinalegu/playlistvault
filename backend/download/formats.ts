import type { DownloadOptions, VideoQuality } from '@shared/types';

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
}): string[] {
  const { url, outputTemplate, options, ffmpegPath } = params;

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

  if (options.rateLimitKbps && options.rateLimitKbps > 0) {
    args.push('--limit-rate', `${options.rateLimitKbps}K`);
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
export function buildAnalyzeArgs(url: string): string[] {
  return [
    '--dump-single-json',
    '--flat-playlist',
    '--ignore-config',
    '--no-warnings',
    '--no-colors',
    '--socket-timeout', '30',
    '--retries', '3',
    url
  ];
}
