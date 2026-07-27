export interface ProgressSample {
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  /** True when yt-dlp has moved on to merging/converting via ffmpeg. */
  postProcessing?: boolean;
  /** Per-stream download target (may be an intermediate fragment file). */
  destination?: string;
  /** The definitive output path reported by a post-processor. */
  finalPath?: string;
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
  kb: 1000,
  mb: 1000 ** 2,
  gb: 1000 ** 3
};

function toBytes(value: string, unit: string): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * (SIZE_UNITS[unit.toLowerCase()] ?? 1));
}

function toSeconds(clock: string): number {
  const parts = clock.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/**
 * Parse a single `--newline --progress` output line from yt-dlp.
 * Returns undefined for lines that carry no progress information.
 *
 * Example line:
 * [download]  42.3% of ~  1.20GiB at   5.44MiB/s ETA 02:11
 */
export function parseProgressLine(line: string): ProgressSample | undefined {
  const text = line.trim();
  if (!text) return undefined;

  // Post-processing lines also reveal the FINAL output path, which differs
  // from the per-stream "[download] Destination:" paths (e.g. *.f258.m4a).
  const mergeMatch = text.match(/^\[Merger\]\s+Merging formats into\s+"(.+)"$/);
  if (mergeMatch) return { postProcessing: true, finalPath: mergeMatch[1] };

  const extractMatch = text.match(/^\[ExtractAudio\]\s+Destination:\s+(.+)$/);
  if (extractMatch) return { postProcessing: true, finalPath: extractMatch[1].trim() };

  if (text.startsWith('[Merger]') || text.startsWith('[ExtractAudio]') ||
      text.startsWith('[VideoConvertor]') || text.startsWith('[EmbedThumbnail]') ||
      text.startsWith('[Metadata]') || text.startsWith('[SubtitlesConvertor]')) {
    return { postProcessing: true };
  }

  if (!text.startsWith('[download]')) return undefined;

  const destMatch = text.match(/^\[download\]\s+Destination:\s+(.+)$/);
  if (destMatch) return { destination: destMatch[1].trim(), percent: 0 };

  if (/has already been downloaded/i.test(text)) {
    return { percent: 100 };
  }

  const percentMatch = text.match(/(\d{1,3}(?:\.\d+)?)%/);
  if (!percentMatch) return undefined;

  const sample: ProgressSample = {
    percent: Math.min(100, Math.max(0, parseFloat(percentMatch[1])))
  };

  const totalMatch = text.match(/of\s+~?\s*([\d.]+)\s*([KMGT]i?B|B)/i);
  if (totalMatch) sample.totalBytes = toBytes(totalMatch[1], totalMatch[2]);

  const speedMatch = text.match(/at\s+~?\s*([\d.]+)\s*([KMGT]i?B|B)\/s/i);
  if (speedMatch) sample.speedBytesPerSecond = toBytes(speedMatch[1], speedMatch[2]);

  const etaMatch = text.match(/ETA\s+([\d:]+)/i);
  if (etaMatch) sample.etaSeconds = toSeconds(etaMatch[1]);

  if (sample.totalBytes && sample.percent !== undefined) {
    sample.downloadedBytes = Math.round((sample.percent / 100) * sample.totalBytes);
  }

  return sample;
}
