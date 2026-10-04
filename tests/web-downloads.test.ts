import { describe, expect, it } from 'vitest';
import { analyzeUrl, apiBase, videoFileUrl } from '../src/web/store';

describe('web api base', () => {
  it('defaults to same-origin', () => {
    expect(apiBase()).toBe('');
    expect(analyzeUrl()).toBe('/api/analyze');
  });

  it('builds video file URLs with quality flags', () => {
    const url = videoFileUrl('https://www.youtube.com/watch?v=abc12345678', '1080p', false);
    expect(url.startsWith('/api/video?')).toBe(true);
    expect(url).toContain('quality=1080p');
    expect(url).toContain('audioOnly=0');
  });
});
