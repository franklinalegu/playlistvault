/** Formatting helpers shared by backend logs and the renderer UI. */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00';
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatLongDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return formatDuration(seconds);
}

/**
 * Very rough size estimate per quality tier, used before a download starts so
 * the UI can warn about disk usage. Values are bytes-per-second of video.
 */
const BITRATE_BYTES_PER_SECOND: Record<string, number> = {
  best: 1_100_000,
  '2160p': 2_200_000,
  '1440p': 1_400_000,
  '1080p': 700_000,
  '720p': 380_000,
  '480p': 210_000,
  '360p': 130_000,
  'audio-only': 20_000
};

export function estimateBytes(durationSeconds: number, quality: string): number {
  const rate = BITRATE_BYTES_PER_SECOND[quality] ?? BITRATE_BYTES_PER_SECOND['1080p'];
  return Math.round(durationSeconds * rate);
}
