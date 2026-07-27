import { describe, expect, it } from 'vitest';
import { estimateBytes, formatBytes, formatDuration, formatLongDuration, formatSpeed } from '../shared/format';

describe('formatBytes', () => {
  it('formats each unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 ** 3 * 2.5)).toBe('2.5 GB');
  });
  it('handles invalid input', () => {
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});

describe('formatLongDuration', () => {
  it('reads naturally', () => {
    expect(formatLongDuration(600)).toBe('10m');
    expect(formatLongDuration(7200)).toBe('2h 0m');
  });
});

describe('formatSpeed', () => {
  it('returns a dash when idle', () => {
    expect(formatSpeed(0)).toBe('—');
  });
});

describe('estimateBytes', () => {
  it('scales with duration', () => {
    expect(estimateBytes(3600, '1080p')).toBeGreaterThan(estimateBytes(1800, '1080p'));
  });
  it('rates higher qualities larger', () => {
    expect(estimateBytes(600, '2160p')).toBeGreaterThan(estimateBytes(600, '480p'));
  });
});
