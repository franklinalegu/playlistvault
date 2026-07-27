import { describe, expect, it } from 'vitest';
import { buildDownloadArgs, buildFormatSelector } from '../backend/download/formats';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../shared/types';

const base = { ...DEFAULT_DOWNLOAD_OPTIONS };

describe('buildFormatSelector', () => {
  it('caps height for a specific quality', () => {
    expect(buildFormatSelector({ ...base, quality: '720p' })).toContain('height<=720');
  });

  it('uses audio selectors when audio-only', () => {
    expect(buildFormatSelector({ ...base, audioOnly: true })).toBe('bestaudio/best');
  });

  it('always has a fallback branch', () => {
    expect(buildFormatSelector({ ...base, quality: '1080p' })).toContain('bv*+ba/b');
  });
});

describe('buildDownloadArgs', () => {
  const args = (o = {}) =>
    buildDownloadArgs({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      outputTemplate: 'C:\\out\\01 - Test.%(ext)s',
      options: { ...base, ...o },
      ffmpegPath: 'C:\\bin\\ffmpeg.exe'
    });

  it('passes every value as a discrete argv entry', () => {
    const a = args();
    expect(a).toContain('--output');
    expect(a[a.indexOf('--output') + 1]).toBe('C:\\out\\01 - Test.%(ext)s');
    // No argument should be a joined shell string.
    expect(a.some((x) => x.includes('&&') || x.includes('|'))).toBe(false);
  });

  it('never downloads the whole playlist for a single item', () => {
    expect(args()).toContain('--no-playlist');
  });

  it('adds extraction flags for audio-only jobs', () => {
    const a = args({ audioOnly: true, audioFormat: 'flac' });
    expect(a).toContain('--extract-audio');
    expect(a[a.indexOf('--audio-format') + 1]).toBe('flac');
    expect(a).not.toContain('--merge-output-format');
  });

  it('adds subtitle flags only when requested', () => {
    expect(args()).not.toContain('--write-subs');
    const a = args({ writeSubtitles: true, subtitleLanguages: ['en', 'fr'] });
    expect(a[a.indexOf('--sub-langs') + 1]).toBe('en,fr');
  });

  it('applies a rate limit when set', () => {
    const a = args({ rateLimitKbps: 500 });
    expect(a[a.indexOf('--limit-rate') + 1]).toBe('500K');
  });

  it('puts the URL last', () => {
    const a = args();
    expect(a[a.length - 1]).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
