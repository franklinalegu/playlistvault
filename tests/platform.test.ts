import { describe, expect, it } from 'vitest';
import { parseSourceUrl } from '../backend/util/platform';
import { buildDownloadArgs } from '../backend/download/formats';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../shared/types';

describe('parseSourceUrl', () => {
  it('routes YouTube playlists', () => {
    const r = parseSourceUrl('https://www.youtube.com/playlist?list=PLabc123');
    expect(r.valid).toBe(true);
    expect(r.platform).toBe('youtube');
    expect(r.kind).toBe('playlist');
    expect(r.normalized).toBe('https://www.youtube.com/playlist?list=PLabc123');
  });

  it('routes YouTube videos', () => {
    const r = parseSourceUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(r.valid).toBe(true);
    expect(r.platform).toBe('youtube');
    expect(r.kind).toBe('video');
  });

  it('routes Udemy courses', () => {
    const r = parseSourceUrl('https://www.udemy.com/course/python-bootcamp/');
    expect(r.valid).toBe(true);
    expect(r.platform).toBe('udemy');
    expect(r.kind).toBe('playlist');
    expect(r.normalized).toBe('https://www.udemy.com/course/python-bootcamp/');
  });

  it('routes Udemy lecture URLs', () => {
    const r = parseSourceUrl('https://www.udemy.com/course/python-bootcamp/learn/lecture/1234567');
    expect(r.valid).toBe(true);
    expect(r.platform).toBe('udemy');
    expect(r.kind).toBe('video');
    expect(r.normalized).toMatch(/lecture\/1234567$/);
  });

  it('rejects Udemy URLs that are neither course nor lecture', () => {
    const r = parseSourceUrl('https://www.udemy.com/mobile/apps/');
    expect(r.valid).toBe(false);
  });

  it('rejects unknown hosts', () => {
    const r = parseSourceUrl('https://evil.example.com/playlist?list=PL1');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/YouTube and Udemy/i);
  });
});

describe('buildDownloadArgs platform plumbing', () => {
  const base = { ...DEFAULT_DOWNLOAD_OPTIONS };

  it('resolves a course lecture by playlist position instead of single-video mode', () => {
    const a = buildDownloadArgs({
      url: 'https://www.udemy.com/course/python-bootcamp/',
      outputTemplate: '%(chapter_number)02d - %(chapter)s/%(title)s.%(ext)s',
      options: base,
      ffmpegPath: 'C:\\bin\\ffmpeg.exe',
      playlistItems: 12
    });
    expect(a).not.toContain('--no-playlist');
    expect(a[a.indexOf('--playlist-items') + 1]).toBe('12');
    expect(a[a.indexOf('--output-na-placeholder') + 1]).toBe('');
  });

  it('adds a cookies file when configured', () => {
    const a = buildDownloadArgs({
      url: 'https://www.udemy.com/course/python-bootcamp/',
      outputTemplate: '%(title)s.%(ext)s',
      options: base,
      ffmpegPath: 'C:\\bin\\ffmpeg.exe',
      cookiesFile: 'C:\\users\\me\\cookies.txt'
    });
    expect(a[a.indexOf('--cookies') + 1]).toBe('C:\\users\\me\\cookies.txt');
  });
});