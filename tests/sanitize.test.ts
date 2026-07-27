import { describe, expect, it } from 'vitest';
import {
  isSafeDestination,
  padIndex,
  parseYouTubeUrl,
  resolveWithin,
  sanitizeFilename
} from '../backend/util/sanitize';

describe('sanitizeFilename', () => {
  it('strips characters Windows forbids', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a b c d e f g h i j');
  });

  it('collapses whitespace and trims trailing dots', () => {
    expect(sanitizeFilename('  My   Video...  ')).toBe('My Video');
  });

  it('never returns an empty name', () => {
    expect(sanitizeFilename('...')).toBe('untitled');
    expect(sanitizeFilename('')).toBe('untitled');
  });

  it('escapes reserved device names', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('nul.mp4')).toBe('_nul.mp4');
  });

  it('truncates very long titles', () => {
    expect(sanitizeFilename('x'.repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it('removes newlines and colons injected into titles', () => {
    // The newline collapses to a space and the colon is stripped entirely.
    expect(sanitizeFilename('evil\n&& del C:')).toBe('evil && del C');
  });
});

describe('padIndex', () => {
  it('pads to at least two digits', () => {
    expect(padIndex(3, 9)).toBe('03');
  });
  it('widens for large playlists', () => {
    expect(padIndex(7, 1200)).toBe('0007');
  });
});

describe('resolveWithin', () => {
  it('allows paths inside the root', () => {
    expect(resolveWithin('/downloads', 'playlist/01.mp4')).toContain('playlist');
  });
  it('blocks traversal outside the root', () => {
    expect(() => resolveWithin('/downloads', '../../etc/passwd')).toThrow();
  });
});

describe('isSafeDestination', () => {
  it('rejects protected system folders', () => {
    expect(isSafeDestination('C:\\Windows\\System32')).toBe(false);
    expect(isSafeDestination('/etc')).toBe(false);
  });
  it('accepts normal user folders', () => {
    expect(isSafeDestination('C:\\Users\\me\\Videos')).toBe(true);
  });
  it('rejects empty input', () => {
    expect(isSafeDestination('')).toBe(false);
  });
});

describe('parseYouTubeUrl', () => {
  it('parses a playlist link', () => {
    const r = parseYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890');
    expect(r.valid).toBe(true);
    expect(r.kind).toBe('playlist');
    expect(r.normalized).toBe('https://www.youtube.com/playlist?list=PL1234567890');
  });

  it('prefers the playlist when a watch URL carries a list param', () => {
    const r = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc');
    expect(r.kind).toBe('playlist');
  });

  it('parses youtu.be short links', () => {
    const r = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(r.kind).toBe('video');
    expect(r.normalized).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('rejects non-YouTube hosts', () => {
    expect(parseYouTubeUrl('https://evil.example.com/playlist?list=PL1').valid).toBe(false);
  });

  it('rejects non-web protocols', () => {
    expect(parseYouTubeUrl('file:///C:/Windows/System32').valid).toBe(false);
  });

  it('rejects empty input with a helpful message', () => {
    const r = parseYouTubeUrl('   ');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Enter a URL/);
  });
});
