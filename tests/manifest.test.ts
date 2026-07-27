import { describe, expect, it } from 'vitest';
import {
  extractChapters,
  extractDescriptionLinks
} from '../backend/manifest/linkExtractor';
import { buildManifestHtml, buildManifestJson } from '../backend/manifest/manifestWriter';
import type { VideoLinks } from '../backend/manifest/linkExtractor';

const META = {
  playlistTitle: 'Test Playlist',
  creator: 'Aurora Studio',
  sourceUrl: 'https://www.youtube.com/playlist?list=PLabc',
  destination: 'C:\\Videos\\Test',
  generatedAt: '2026-07-27T10:00:00.000Z',
  quality: '1080p',
  container: 'mp4',
  audioOnly: false
};

function video(over: Partial<VideoLinks> = {}): VideoLinks {
  return {
    videoId: 'abc12345678',
    title: 'Sample Video',
    fileName: '01 - Sample Video.mp4',
    durationSeconds: 125,
    watchUrl: 'https://www.youtube.com/watch?v=abc12345678',
    descriptionLinks: [],
    chapters: [],
    ...over
  };
}

describe('extractDescriptionLinks', () => {
  it('pulls URLs out of a description', () => {
    const links = extractDescriptionLinks('Check https://example.com for more');
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://example.com/');
  });

  it('labels a link with the text preceding it on the line', () => {
    const links = extractDescriptionLinks('Gear I use: https://example.com/gear');
    expect(links[0].label).toBe('Gear I use');
  });

  it('strips list bullets from labels', () => {
    const links = extractDescriptionLinks('- Website → https://example.com');
    expect(links[0].label).not.toContain('-');
  });

  it('de-duplicates repeated URLs', () => {
    const links = extractDescriptionLinks('a https://example.com\nb https://example.com');
    expect(links).toHaveLength(1);
  });

  it('finds several links across multiple lines', () => {
    const links = extractDescriptionLinks(
      'Twitter: https://twitter.com/x\nGitHub: https://github.com/y\nSite: https://z.dev'
    );
    expect(links).toHaveLength(3);
  });

  it('does not swallow trailing punctuation', () => {
    const links = extractDescriptionLinks('See https://example.com/page, then leave.');
    expect(links[0].url).not.toContain(',');
  });

  it('ignores non-http schemes', () => {
    const links = extractDescriptionLinks('mail me at mailto:a@b.com or ftp://files.example.com');
    expect(links).toHaveLength(0);
  });

  it('returns nothing for an empty description', () => {
    expect(extractDescriptionLinks('')).toEqual([]);
    expect(extractDescriptionLinks(undefined as unknown as string)).toEqual([]);
  });

  it('never puts an earlier URL inside a label', () => {
    const links = extractDescriptionLinks('See https://a.com and also https://b.com');
    expect(links[1].label ?? '').not.toContain('http');
  });

  it('strips arrow glyphs from labels', () => {
    const links = extractDescriptionLinks('Mastodon → https://mastodon.social/@x');
    expect(links[0].label).toBe('Mastodon');
  });

  it('truncates very long labels', () => {
    const links = extractDescriptionLinks(`${'x'.repeat(300)}: https://example.com`);
    expect((links[0].label ?? '').length).toBeLessThanOrEqual(90);
  });
});

describe('extractChapters', () => {
  it('builds timestamped jump links', () => {
    const ch = extractChapters(
      [{ title: 'Intro', start_time: 0 }, { title: 'Setup', start_time: 95 }],
      'abc12345678'
    );
    expect(ch).toHaveLength(2);
    expect(ch[1].url).toContain('t=95s');
  });

  it('ignores malformed entries', () => {
    const ch = extractChapters([{ title: '' }, null, { start_time: 'x' }], 'abc');
    expect(ch).toEqual([]);
  });

  it('handles a missing chapter list', () => {
    expect(extractChapters(undefined, 'abc')).toEqual([]);
  });
});

describe('buildManifestHtml', () => {
  it('renders one row per video with its real filename', () => {
    const html = buildManifestHtml(META, [
      video(),
      video({ videoId: 'def', title: 'Second', fileName: '02 - Second.mp4' })
    ]);
    expect(html).toContain('01 - Sample Video.mp4');
    expect(html).toContain('02 - Second.mp4');
    expect(html).toContain('Test Playlist');
  });

  it('escapes HTML in titles so a crafted title cannot inject markup', () => {
    const html = buildManifestHtml(META, [
      video({ title: '<img src=x onerror=alert(1)>' })
    ]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('drops javascript: URLs scraped from a description', () => {
    const html = buildManifestHtml(META, [
      video({
        descriptionLinks: [
          { url: 'javascript:alert(1)', label: 'bad' },
          { url: 'https://good.example.com', label: 'good' }
        ]
      })
    ]);
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('https://good.example.com');
  });

  it('drops data: URLs too', () => {
    const html = buildManifestHtml(META, [
      video({ thumbnailUrl: 'data:text/html;base64,PHN2Zz4=' })
    ]);
    expect(html).not.toContain('href="data:');
  });

  it('encodes filenames so spaces do not break the local link', () => {
    const html = buildManifestHtml(META, [video({ fileName: '01 - A & B.mp4' })]);
    expect(html).toContain('href="01%20-%20A%20%26%20B.mp4"');
  });

  it('counts the links it found', () => {
    const html = buildManifestHtml(META, [
      video({ descriptionLinks: [{ url: 'https://a.com' }, { url: 'https://b.com' }] })
    ]);
    expect(html).toContain('<b>2</b>links found');
  });

  it('notes when a video has no description links', () => {
    const html = buildManifestHtml(META, [video()]);
    expect(html).toContain('No links found in the description.');
  });

  it('marks a missing file rather than emitting a broken link', () => {
    const html = buildManifestHtml(META, [video({ fileName: undefined })]);
    expect(html).toContain('No file recorded');
  });

  it('produces a complete standalone document', () => {
    const html = buildManifestHtml(META, [video()]);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

describe('buildManifestJson', () => {
  it('round-trips through JSON.parse', () => {
    const parsed = JSON.parse(buildManifestJson(META, [video()]));
    expect(parsed.playlist.playlistTitle).toBe('Test Playlist');
    expect(parsed.videos[0].fileName).toBe('01 - Sample Video.mp4');
  });
});
