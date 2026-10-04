import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPerVideoHtml, writePerVideoManifest } from '../backend/manifest/manifestWriter';
import type { VideoLinks } from '../backend/manifest/linkExtractor';

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

describe('channel archive per-video pages', () => {
  it('renders a standalone page with source and chapters', () => {
    const html = buildPerVideoHtml(
      video({
        channelName: 'Aurora',
        channelUrl: 'https://www.youtube.com/@aurora',
        descriptionLinks: [{ url: 'https://example.com/gear', label: 'Gear' }],
        chapters: [{ title: 'Intro', startSeconds: 0, url: 'https://www.youtube.com/watch?v=abc&t=0s' }]
      }),
      { playlistTitle: 'My Channel', sourceUrl: 'https://www.youtube.com/@aurora', generatedAt: new Date().toISOString() }
    );
    expect(html).toContain('Sample Video');
    expect(html).toContain('Watch source');
    expect(html).toContain('https://example.com/gear');
    expect(html).toContain('Intro');
  });

  it('escapes titles and drops javascript: URLs', () => {
    const html = buildPerVideoHtml(
      video({
        title: '<img src=x onerror=alert(1)>',
        descriptionLinks: [{ url: 'javascript:alert(1)', label: 'bad' }]
      }),
      { playlistTitle: 'P', sourceUrl: 'https://www.youtube.com/@x', generatedAt: new Date().toISOString() }
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('href="javascript:');
  });

  it('writes the page next to the media file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-pervideo-'));
    try {
      const out = await writePerVideoManifest(
        dir,
        video({ fileName: '01 - Clip.mp4' }),
        { playlistTitle: 'P', sourceUrl: 'https://www.youtube.com/@x', generatedAt: new Date().toISOString() }
      );
      expect(out).toBe(path.join(dir, '01 - Clip.links.html'));
      expect(fs.existsSync(out)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
