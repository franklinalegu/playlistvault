import { describe, expect, it } from 'vitest';
import { compareYtDlpVersions } from '../backend/setup/ytDlpUpdater';
import { humanizeYtDlpError } from '../backend/download/ytdlp';

describe('compareYtDlpVersions', () => {
  it('orders date-based versions', () => {
    expect(compareYtDlpVersions('2025.01.15', '2024.11.16')).toBeGreaterThan(0);
    expect(compareYtDlpVersions('2024.11.16', '2025.01.15')).toBeLessThan(0);
    expect(compareYtDlpVersions('2025.01.15', '2025.01.15')).toBe(0);
  });

  it('compares by month within the same year', () => {
    expect(compareYtDlpVersions('2025.02.01', '2025.12.01')).toBeLessThan(0);
  });

  it('ignores nightly time suffixes', () => {
    expect(compareYtDlpVersions('2025.01.15.123456', '2025.01.15')).toBe(0);
  });
});

describe('humanizeYtDlpError stale detection', () => {
  it('flags Unsupported URL as a stale yt-dlp hint', () => {
    const message = humanizeYtDlpError(
      'ERROR: Unsupported URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      1
    );
    expect(message).toMatch(/out of date/i);
  });

  it('leaves unrelated errors untouched', () => {
    const message = humanizeYtDlpError('ERROR: The playlist is private', 1);
    expect(message).toMatch(/private/i);
    expect(message).not.toMatch(/out of date/i);
  });
});