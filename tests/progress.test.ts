import { describe, expect, it } from 'vitest';
import { parseProgressLine } from '../backend/download/progress';

describe('parseProgressLine', () => {
  it('parses a standard progress line', () => {
    const s = parseProgressLine('[download]  42.3% of ~  1.20GiB at   5.44MiB/s ETA 02:11');
    expect(s?.percent).toBeCloseTo(42.3);
    expect(s?.totalBytes).toBe(Math.round(1.2 * 1024 ** 3));
    expect(s?.speedBytesPerSecond).toBe(Math.round(5.44 * 1024 ** 2));
    expect(s?.etaSeconds).toBe(131);
  });

  it('derives downloaded bytes from percent and total', () => {
    const s = parseProgressLine('[download]  50.0% of 100.00MiB at 1.00MiB/s ETA 00:50');
    expect(s?.downloadedBytes).toBe(Math.round(0.5 * 100 * 1024 ** 2));
  });

  it('captures the destination path', () => {
    const s = parseProgressLine('[download] Destination: C:\\Videos\\01 - Intro.mp4');
    expect(s?.destination).toBe('C:\\Videos\\01 - Intro.mp4');
  });

  it('treats already-downloaded files as complete', () => {
    const s = parseProgressLine('[download] C:\\v\\a.mp4 has already been downloaded');
    expect(s?.percent).toBe(100);
  });

  it('flags post-processing stages', () => {
    expect(parseProgressLine('[Merger] Merging formats into "out.mp4"')?.postProcessing).toBe(true);
    expect(parseProgressLine('[ExtractAudio] Destination: a.mp3')?.postProcessing).toBe(true);
    expect(parseProgressLine('[EmbedThumbnail] mp4')?.postProcessing).toBe(true);
  });

  it('extracts the final merged path, not the stream fragment', () => {
    const s = parseProgressLine('[Merger] Merging formats into "C:\\v\\01 - Clip.mp4"');
    expect(s?.finalPath).toBe('C:\\v\\01 - Clip.mp4');
  });

  it('extracts the final path for audio extraction', () => {
    const s = parseProgressLine('[ExtractAudio] Destination: C:\\v\\01 - Song.mp3');
    expect(s?.finalPath).toBe('C:\\v\\01 - Song.mp3');
  });

  it('does not treat a fragment destination as final', () => {
    const s = parseProgressLine('[download] Destination: C:\\v\\01 - Clip.f258.m4a');
    expect(s?.destination).toBe('C:\\v\\01 - Clip.f258.m4a');
    expect(s?.finalPath).toBeUndefined();
  });

  it('ignores unrelated output', () => {
    expect(parseProgressLine('[youtube] Extracting URL')).toBeUndefined();
    expect(parseProgressLine('')).toBeUndefined();
  });

  it('handles ETA with hours', () => {
    const s = parseProgressLine('[download]  10.0% of 5.00GiB at 500.00KiB/s ETA 01:20:30');
    expect(s?.etaSeconds).toBe(4830);
  });
});
