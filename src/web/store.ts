/**
 * Shared web-build state: localStorage persistence + pub/sub for the browser
 * vault client and the in-browser download engine.
 *
 * Split out of vaultWeb.ts so the engine and the vault API share the same job
 * list and progress subscribers (the QueueContext UI only listens on these).
 */
import type {
  ApiResult,
  AppSettings,
  DownloadJob,
  HistoryEntry,
  JobProgressSnapshot,
} from '@shared/types';
import { DEFAULT_DOWNLOAD_OPTIONS } from '@shared/types';

export const LS_SETTINGS = 'pv.web.settings.v1';
export const LS_HISTORY = 'pv.web.history.v1';
export const LS_JOBS = 'pv.web.jobs.v1';
export const LS_SAVES = 'pv.web.saves.v1';

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}
export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode — non-fatal for web use */
  }
}

export const WEB_DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: '#6366f1',
  background: 'neo-mesh',
  defaultDestination: 'Browser downloads',
  defaultOptions: { ...DEFAULT_DOWNLOAD_OPTIONS },
  maxConcurrentJobs: 1,
  notificationsEnabled: false,
  notifyOnEachVideo: false,
  clipboardMonitoring: false,
  autoCheckUpdates: false,
  autoUpdateYtDlp: false,
  minimizeToTray: false,
  confirmBeforeQuit: false,
  keepHistoryDays: 365,
  recentDestinations: ['Browser downloads'],
  legalAcknowledged: false,
  browserCookieSource: 'none',
  cookiesFile: undefined,
  proxy: { enabled: false, type: 'http', host: '', port: 8080 },
  globalSpeedLimitKbps: 0,
  postDownloadAction: 'none',
  keyboardShortcutsEnabled: true,
  showSpeedInNotification: false,
  firstRunComplete: false,
};

export type ProgressCb = (snap: JobProgressSnapshot) => void;
export type JobDoneCb = (payload: { job: DownloadJob; entry: HistoryEntry }) => void;

const progressSubs = new Set<ProgressCb>();
const jobDoneSubs = new Set<JobDoneCb>();

export function subscribeProgress(cb: ProgressCb): () => void {
  progressSubs.add(cb);
  return () => {
    progressSubs.delete(cb);
  };
}
export function subscribeJobDone(cb: JobDoneCb): () => void {
  jobDoneSubs.add(cb);
  return () => {
    jobDoneSubs.delete(cb);
  };
}

export function emitProgress(job: DownloadJob): void {
  const total = job.items.length || 1;
  const completed = job.items.filter((i) => i.status === 'completed').length;
  const failed = job.items.filter((i) => i.status === 'failed' || i.status === 'canceled').length;
  const snap: JobProgressSnapshot = {
    jobId: job.id,
    status: job.status,
    completed,
    failed,
    total,
    overallProgress: total ? completed / total : 0,
    speedBytesPerSecond: 0,
    etaSeconds: 0,
    items: job.items,
  };
  progressSubs.forEach((cb) => {
    try {
      cb(snap);
    } catch {
      /* subscriber error must not break queue */
    }
  });
}

export function emitJobDone(job: DownloadJob, entry: HistoryEntry): void {
  jobDoneSubs.forEach((cb) => {
    try {
      cb({ job, entry });
    } catch {
      /* subscriber error must not break queue */
    }
  });
}

export function loadJobs(): DownloadJob[] {
  return readJson<DownloadJob[]>(LS_JOBS, []);
}
export function saveJobs(jobs: DownloadJob[]): void {
  writeJson(LS_JOBS, jobs);
}

export function loadHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(LS_HISTORY, []);
}
export function saveHistory(entries: HistoryEntry[]): void {
  writeJson(LS_HISTORY, entries);
}
export function appendHistory(entry: HistoryEntry): void {
  const next = [entry, ...loadHistory()].slice(0, 500);
  saveHistory(next);
}

/** Filenames the web app saved (anchor downloads + library-dir writes). */
export interface SavedRecord {
  filename: string;
  title: string;
  bytes: number;
  savedAt: string;
  quality: string;
  audioOnly: boolean;
  /** Library-relative path when saved via the picked folder, else null. */
  libraryPath: string | null;
}

export function loadSaves(): SavedRecord[] {
  return readJson<SavedRecord[]>(LS_SAVES, []);
}
export function recordSave(rec: SavedRecord): void {
  const next = [rec, ...loadSaves().filter((s) => s.filename !== rec.filename)].slice(0, 500);
  writeJson(LS_SAVES, next);
}

/**
 * Base URL of the hosted API (yt-dlp engine). Same-origin by default; set
 * `VITE_API_BASE=https://your-host` for packaged clients (Android APK,
 * self-hosted frontends) whose WebView has no local /api/* server.
 */
export function apiBase(): string {
  try {
    const base = (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE;
    if (typeof base === 'string' && base.trim()) return base.trim().replace(/\/+$/, '');
  } catch {
    /* non-Vite context (tests) — same-origin */
  }
  return '';
}

/** Server streaming endpoint for one video file. */
export function videoFileUrl(videoUrl: string, quality: string, audioOnly: boolean): string {
  const q = new URLSearchParams({ url: videoUrl, quality, audioOnly: audioOnly ? '1' : '0' });
  return `${apiBase()}/api/video?${q.toString()}`;
}

/** Analyze endpoint (playlist metadata). */
export function analyzeUrl(): string {
  return `${apiBase()}/api/analyze`;
}

/** Filename-safe title with the right extension. Exported for engine + UI. */
export function safeFilename(title: string, audioOnly: boolean): string {
  const stem = title.replace(/[\\/:*?"<>|#%{}$!'@+`=]/g, '').trim().slice(0, 120) || 'video';
  return `${stem}.${audioOnly ? 'mp3' : 'mp4'}`;
}
