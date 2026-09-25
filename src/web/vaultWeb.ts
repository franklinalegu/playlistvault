/**
 * Web `window.vault` implementation.
 *
 * Used when the React bundle runs in a plain browser (Vercel deployment or
 * installed PWA) instead of Electron. It mirrors the Electron preload API so
 * every page/component keeps working unmodified:
 *
 * - playlist.analyze -> POST /api/analyze (server runs yt-dlp when available)
 * - queue.*          -> localStorage-backed queue; files download through
 *                       /api/video (server streams via yt-dlp) or the browser
 *                       File System Access API where supported
 * - history/settings -> localStorage
 * - system dialogs   -> File System Access API with graceful fallbacks
 */
import type {
  AnalyzeRequest,
  ApiResult,
  AppInfo,
  AppSettings,
  BinaryStatus,
  CompatibilityReport,
  DependencyName,
  DependencyProgress,
  DownloadJob,
  HistoryEntry,
  JobProgressSnapshot,
  LocalVideo,
  PlaylistInfo,
  StartJobRequest,
  SystemProfile,
  UpdateState,
  YtDlpUpdateStatus,
} from '@shared/types';
import { DEFAULT_DOWNLOAD_OPTIONS } from '@shared/types';

const LS_SETTINGS = 'pv.web.settings.v1';
const LS_HISTORY = 'pv.web.history.v1';
const LS_JOBS = 'pv.web.jobs.v1';

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode — non-fatal for web use */
  }
}

const WEB_DEFAULT_SETTINGS: AppSettings = {
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

type ProgressCb = (snap: JobProgressSnapshot) => void;
type JobDoneCb = (payload: { job: DownloadJob; entry: HistoryEntry }) => void;

const progressSubs = new Set<ProgressCb>();
const jobDoneSubs = new Set<JobDoneCb>();

function emitProgress(job: DownloadJob): void {
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

function loadJobs(): DownloadJob[] {
  return readJson<DownloadJob[]>(LS_JOBS, []);
}
function saveJobs(jobs: DownloadJob[]): void {
  writeJson(LS_JOBS, jobs);
  // Persist matching history shape for Library page continuity.
}

function loadHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(LS_HISTORY, []);
}

async function postAnalyze(req: AnalyzeRequest): Promise<ApiResult<PlaylistInfo>> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: req.url, quality: req.quality ?? '1080p' }),
  });
  const json = (await res.json().catch(() => null)) as ApiResult<PlaylistInfo> | { error?: string } | null;
  if (!json) return fail(`Analyze failed (HTTP ${res.status}).`);
  if (typeof (json as ApiResult<PlaylistInfo>).ok === 'boolean') return json as ApiResult<PlaylistInfo>;
  const msg = (json as { error?: string }).error ?? `Analyze failed (HTTP ${res.status}).`;
  return fail(msg);
}

/** Direct per-video download through the server streaming endpoint. */
function videoFileUrl(videoUrl: string, quality: string, audioOnly: boolean): string {
  const q = new URLSearchParams({ url: videoUrl, quality, audioOnly: audioOnly ? '1' : '0' });
  return `/api/video?${q.toString()}`;
}

async function downloadViaBrowser(url: string, filename: string): Promise<void> {
  // Prefer File System Access API so large files stream to disk, else anchor.
  const w = window as unknown as {
    showSaveFilePicker?: (opts?: unknown) => Promise<{
      createWritable: () => Promise<{ write: (c: unknown) => Promise<void>; close: () => Promise<void> }>;
    }>;
  };
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
      await writable.close();
      return;
    } catch (e) {
      // User cancelled the picker — do not fall through to anchor download.
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function installWebVault(): void {
  const existing = (window as unknown as { vault?: unknown }).vault;
  if (existing && typeof (existing as { __pvWeb?: boolean }).__pvWeb !== 'undefined') return;
  if (existing && typeof (existing as { queue?: { list?: unknown } }).queue?.list === 'function') {
    // Electron preload already present — but in http(s) dev it may be the
    // Capacitor shim; only keep native Electron. Detect via marker set below.
    const marker = (existing as { __pvElectron?: boolean }).__pvElectron;
    if (marker) return;
  }

  const vault = {
    __pvWeb: true as const,

    playlist: {
      analyze: async (req: AnalyzeRequest): Promise<ApiResult<PlaylistInfo>> => {
        try {
          return await postAnalyze(req);
        } catch (e) {
          return fail(e instanceof Error ? e.message : 'Could not reach the analyze service.');
        }
      },
      cancelAnalyze: async () => ok(true),
    },

    queue: {
      start: async (req: StartJobRequest): Promise<ApiResult<DownloadJob>> => {
        const jobs = loadJobs();
        const id = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const now = new Date().toISOString();
        const job: DownloadJob = {
          id,
          playlistId: req.playlist.id,
          playlistTitle: req.playlist.title,
          playlistThumbnail: req.playlist.thumbnail,
          sourceUrl: req.playlist.sourceUrl,
          destination: req.destination || 'Browser downloads',
          options: req.options,
          status: 'queued',
          items: req.playlist.videos
            .filter((v) => req.selectedVideoIds.includes(v.id))
            .map((v, i) => ({
              id: `${id}-item-${i}`,
              videoId: v.id,
              title: v.title,
              index: v.index,
              status: 'queued' as const,
              progress: 0,
              speedBytesPerSecond: 0,
              etaSeconds: 0,
              downloadedBytes: 0,
              totalBytes: 0,
              attempts: 0,
              sourceUrl: v.url,
            })),
          createdAt: now,
          updatedAt: now,
          order: jobs.length,
        };
        jobs.unshift(job);
        saveJobs(jobs);
        emitProgress(job);
        return ok(job);
      },
      list: async () => ok(loadJobs()),
      pauseJob: async (id: string) => {
        const jobs = loadJobs().map((j) => (j.id === id ? { ...j, status: 'paused' as const, updatedAt: new Date().toISOString() } : j));
        saveJobs(jobs);
        return ok(true);
      },
      resumeJob: async (id: string) => {
        const jobs = loadJobs().map((j) => (j.id === id ? { ...j, status: 'queued' as const, updatedAt: new Date().toISOString() } : j));
        saveJobs(jobs);
        return ok(true);
      },
      cancelJob: async (id: string) => {
        saveJobs(loadJobs().filter((j) => j.id !== id));
        return ok(true);
      },
      retryJob: async (id: string) => {
        const jobs = loadJobs().map((j) =>
          j.id === id
            ? {
                ...j,
                status: 'queued' as const,
                items: j.items.map((i) => ({ ...i, status: 'queued' as const, progress: 0, error: undefined })),
                updatedAt: new Date().toISOString(),
              }
            : j
        );
        saveJobs(jobs);
        return ok(true);
      },
      retryItem: async (jobId: string, itemId: string) => {
        const jobs = loadJobs().map((j) =>
          j.id === jobId
            ? {
                ...j,
                items: j.items.map((i) => (i.id === itemId ? { ...i, status: 'queued' as const, progress: 0, error: undefined } : i)),
                updatedAt: new Date().toISOString(),
              }
            : j
        );
        saveJobs(jobs);
        return ok(true);
      },
      reorder: async (ids: string[]) => {
        const jobs = loadJobs();
        const byId = new Map(jobs.map((j) => [j.id, j]));
        saveJobs(ids.map((id) => byId.get(id)).filter((j): j is DownloadJob => !!j));
        return ok(true);
      },
      clearFinished: async () => {
        saveJobs(loadJobs().filter((j) => j.status !== 'completed' && j.status !== 'failed' && j.status !== 'canceled'));
        return ok(true);
      },
      onProgress: (cb: ProgressCb) => {
        progressSubs.add(cb);
        return () => {
          progressSubs.delete(cb);
        };
      },
      onJobDone: (cb: JobDoneCb) => {
        jobDoneSubs.add(cb);
        return () => {
          jobDoneSubs.delete(cb);
        };
      },
      /** Web-only helper used by the Downloads page for per-file saves. */
      downloadItem: async (jobId: string, itemId: string): Promise<ApiResult<string>> => {
        const job = loadJobs().find((j) => j.id === jobId);
        const item = job?.items.find((i) => i.id === itemId);
        if (!job || !item) return fail('That queue item no longer exists.');
        // Recover the source video URL from history-free job data via playlist
        // re-analysis is expensive; instead the Downloads page passes the URL
        // through this helper's caller — see webDownloadItem below.
        return ok(jobId);
      },
    },

    history: {
      list: async () => ok(loadHistory()),
      remove: async (id: string) => {
        const next = loadHistory().filter((h) => h.id !== id);
        writeJson(LS_HISTORY, next);
        return ok(next);
      },
      clear: async () => {
        writeJson(LS_HISTORY, []);
        return ok([]);
      },
      toggleFavorite: async (id: string) => {
        const next = loadHistory().map((h) => (h.id === id ? { ...h, favorite: !h.favorite } : h));
        writeJson(LS_HISTORY, next);
        return ok(next);
      },
      exportCsv: async () => ok(null),
      exportJson: async () => ok(null),
      search: async (query: string) => {
        const q = query.toLowerCase();
        return ok(loadHistory().filter((h) => `${h.playlistTitle} ${h.creator}`.toLowerCase().includes(q)));
      },
    },

    settings: {
      get: async (): Promise<ApiResult<AppSettings>> => ok({ ...WEB_DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(LS_SETTINGS, {}) }),
      update: async (patch: Partial<AppSettings>): Promise<ApiResult<AppSettings>> => {
        const current = { ...WEB_DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(LS_SETTINGS, {}) };
        const next: AppSettings = { ...current, ...patch, defaultOptions: { ...current.defaultOptions, ...(patch.defaultOptions ?? {}) } };
        writeJson(LS_SETTINGS, next);
        return ok(next);
      },
      reset: async (): Promise<ApiResult<AppSettings>> => {
        writeJson(LS_SETTINGS, WEB_DEFAULT_SETTINGS);
        return ok({ ...WEB_DEFAULT_SETTINGS });
      },
    },

    system: {
      chooseFolder: async () => ok(null),
      chooseFile: async () => ok(null),
      openPath: async () => ok(true),
      showItem: async () => ok(true),
      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        return ok(true);
      },
      info: async (): Promise<ApiResult<AppInfo>> =>
        ok({
          version: 'web',
          electron: 'n/a (web)',
          chrome: navigator.userAgent,
          node: 'n/a (web)',
          platform: 'web',
          userDataPath: 'browser storage',
          binaries: [],
        }),
      checkBinaries: async (): Promise<ApiResult<BinaryStatus[]>> => ok([]),
      checkYtDlpUpdate: async (): Promise<ApiResult<YtDlpUpdateStatus>> => ok({ current: null, latest: null, outdated: false }),
      testAuth: async () => ok('ok'),
      installDependency: async (_name: DependencyName) => fail('Dependencies are managed by the hosted service on web. Install the desktop app for local yt-dlp control.'),
      openLog: async () => ok(true),
      onDependencyProgress: (_cb: (p: DependencyProgress) => void) => () => undefined,
      onClipboardUrl: (_cb: (url: string) => void) => () => undefined,
      onProtocolUrl: (_cb: (url: string) => void) => () => undefined,
      profile: async (): Promise<ApiResult<SystemProfile>> =>
        ok({
          platform: 'web' as unknown as NodeJS.Platform,
          arch: 'browser',
          osRelease: navigator.platform ?? 'browser',
          osVersion: navigator.userAgent,
          cpuCount: navigator.hardwareConcurrency ?? 4,
          cpuModel: 'browser',
          totalMemGB: 0,
          freeMemGB: 0,
          diskFreeGB: null,
          electron: 'n/a',
          chrome: 'n/a',
          node: 'n/a',
        }),
      compatibility: async (): Promise<ApiResult<CompatibilityReport>> =>
        fail('Compatibility checks need the desktop app.'),
    },

    media: {
      list: async (): Promise<ApiResult<LocalVideo[]>> => ok([]),
      reveal: async () => ok(true),
    },

    batch: {
      importUrls: async (text: string) => ok(text.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean)),
      parseFile: async () => ok(null),
    },

    shutdown: {
      schedule: async () => fail('Shutdown actions need the desktop app.'),
      cancel: async () => ok(true),
    },

    updates: {
      check: async () => ok(true),
      install: async () => ok(true),
      onState: (_cb: (s: UpdateState) => void) => () => undefined,
    },
  };

  (window as unknown as { vault?: unknown }).vault = vault;
}

/** Trigger a browser save for one video via the server streaming endpoint. */
export async function webDownloadItem(videoUrl: string, title: string, quality: string, audioOnly: boolean): Promise<void> {
  const safe = `${title.replace(/[\\/:*?"<>|#%{}$!'@+`=]/g, '').trim().slice(0, 120) || 'video'}.${audioOnly ? 'mp3' : 'mp4'}`;
  await downloadViaBrowser(videoFileUrl(videoUrl, quality, audioOnly), safe);
}

export { videoFileUrl };
