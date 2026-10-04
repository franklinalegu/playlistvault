/**
 * Web `window.vault` implementation.
 *
 * Used when the React bundle runs in a plain browser (Vercel deployment or
 * installed PWA) instead of Electron. It mirrors the Electron preload API so
 * every page/component keeps working unmodified:
 *
 * - playlist.analyze -> POST /api/analyze (server runs yt-dlp when available)
 * - queue.*          -> localStorage-backed queue pumped by the in-browser
 *                       engine (src/web/engine.ts): streams each file from
 *                       /api/video into the picked library folder, with live
 *                       progress, history entries and completion toasts
 * - history/settings -> localStorage
 * - system dialogs   -> File System Access API with graceful fallbacks
 * - media.list       -> files in the picked library folder + saved records
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
  LocalVideo,
  PlaylistInfo,
  StartJobRequest,
  SystemProfile,
  UpdateState,
  YtDlpUpdateStatus,
} from '@shared/types';
import {
  LS_SETTINGS,  WEB_DEFAULT_SETTINGS, analyzeUrl,
  emitProgress,
  fail,
  loadHistory,
  loadJobs,
  loadSaves,
  ok,
  readJson,
  recordSave,
  safeFilename,
  saveHistory,
  saveJobs,
  subscribeJobDone,
  subscribeProgress,
  videoFileUrl,
  writeJson,
  type JobDoneCb,
  type ProgressCb,
} from './store';
import { abortWebJob, pumpWebQueue } from './engine';
import { listLibraryFiles, pickLibraryDir, readLibraryFile, supportsLibraryFolder } from './fsLibrary';
import { toDisplayTitle } from '@shared/format';

export { videoFileUrl };

/** Drop repeated video ids (channel shelf overlap) — first occurrence wins. */
function dedupeVideos<T extends { id: string }>(videos: T[]): T[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
}

async function postAnalyze(req: AnalyzeRequest): Promise<ApiResult<PlaylistInfo>> {
  const res = await fetch(analyzeUrl(), {
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
          items: dedupeVideos(req.playlist.videos.filter((v) => req.selectedVideoIds.includes(v.id)))
            .map((v, i) => {
              // Mirror the desktop channel archive: channel uploads land in
              // per-playlist (or uploader) subfolders instead of one flat pile.
              const isChannel = (req.playlist as { kind?: string }).kind === 'channel';
              const raw = isChannel ? v.playlistTitle?.trim() || (v as { uploader?: string }).uploader?.trim() : undefined;
              const subfolder = raw
                ? raw.replace(/[\\/:*?"<>|#%{}$!'@+`=]/g, '').trim().slice(0, 80) || undefined
                : undefined;
              return {
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
                ...(subfolder ? { subfolder } : {}),
              };
            }),
          createdAt: now,
          updatedAt: now,
          order: jobs.length,
        };
        jobs.unshift(job);
        saveJobs(jobs);
        emitProgress(job);
        // The in-browser engine picks it up from here (no more stuck QUEUED).
        pumpWebQueue();
        return ok(job);
      },
      list: async () => ok(loadJobs()),
      pauseJob: async (id: string) => {
        abortWebJob(id);
        const jobs = loadJobs().map((j) => (j.id === id ? { ...j, status: 'paused' as const, updatedAt: new Date().toISOString() } : j));
        saveJobs(jobs);
        const paused = jobs.find((j) => j.id === id);
        if (paused) emitProgress(paused);
        return ok(true);
      },
      resumeJob: async (id: string) => {
        const jobs = loadJobs().map((j) => (j.id === id ? { ...j, status: 'queued' as const, updatedAt: new Date().toISOString() } : j));
        saveJobs(jobs);
        pumpWebQueue();
        return ok(true);
      },
      cancelJob: async (id: string) => {
        abortWebJob(id);
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
        pumpWebQueue();
        return ok(true);
      },
      retryItem: async (jobId: string, itemId: string) => {
        const jobs = loadJobs().map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: j.status === 'failed' ? ('queued' as const) : j.status,
                items: j.items.map((i) => (i.id === itemId ? { ...i, status: 'queued' as const, progress: 0, error: undefined } : i)),
                updatedAt: new Date().toISOString(),
              }
            : j
        );
        saveJobs(jobs);
        pumpWebQueue();
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
      onProgress: (cb: ProgressCb) => subscribeProgress(cb),
      onJobDone: (cb: JobDoneCb) => subscribeJobDone(cb),
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
        saveHistory(next);
        return ok(next);
      },
      clear: async () => {
        saveHistory([]);
        return ok([]);
      },
      toggleFavorite: async (id: string) => {
        const next = loadHistory().map((h) => (h.id === id ? { ...h, favorite: !h.favorite } : h));
        saveHistory(next);
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
      chooseFolder: async (current?: string) => {
        // File System Access API: remember a real library folder the app can
        // save into and browse. Falls back to the previous choice / default.
        if (supportsLibraryFolder()) {
          const name = await pickLibraryDir();
          if (name) return ok(name);
        }
        return ok(current ?? null);
      },
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
      list: async (): Promise<ApiResult<LocalVideo[]>> => {
        // Browse where files actually are: the picked library folder first,
        // then records of plain browser downloads (Firefox/iOS fallback).
        try {
          const files = await listLibraryFiles();
          const fromDir: LocalVideo[] = files.map((f) => {
            const parts = f.path.split('/');
            const playlistTitle = parts.length > 2
              ? `${parts[parts.length - 3]} / ${parts[parts.length - 2]}`
              : parts.length > 1
                ? parts[parts.length - 2]
                : undefined;
            const title = toDisplayTitle(f.name.replace(/\.[^.]+$/, ''));
            return {
              id: `fs:${f.path}`,
              title,
              filePath: f.path,
              fileUrl: '',
              sizeBytes: f.size,
              modifiedAt: new Date(f.modified).toISOString(),
              playlistTitle,
              container: f.ext,
            } satisfies LocalVideo;
          });
          const names = new Set(files.map((f) => f.name));
          const fromSaves: LocalVideo[] = loadSaves()
            .filter((s) => !names.has(s.filename))
            .map((s) => ({
              id: `save:${s.filename}`,
              title: s.title,
              filePath: `Browser downloads/${s.filename}`,
              fileUrl: '',
              sizeBytes: s.bytes,
              modifiedAt: s.savedAt,
              container: s.audioOnly ? 'mp3' : 'mp4',
            }) satisfies LocalVideo);
          return ok([...fromDir, ...fromSaves]);
        } catch {
          return ok([]);
        }
      },
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

  // Resume anything left queued (e.g. from a previous session) — and start
  // processing new jobs from here on.
  pumpWebQueue();
}

/** Trigger a browser save for one video via the server streaming endpoint. */
export async function webDownloadItem(videoUrl: string, title: string, quality: string, audioOnly: boolean): Promise<void> {
  const safe = safeFilename(title, audioOnly);
  await downloadViaBrowser(videoFileUrl(videoUrl, quality, audioOnly), safe);
  recordSave({
    filename: safe,
    title,
    bytes: 0,
    savedAt: new Date().toISOString(),
    quality,
    audioOnly,
    libraryPath: null,
  });
}

/**
 * Resolve a playable URL for a web library entry. Library-folder files are
 * read back into a blob URL (caller should revoke it when done); entries that
 * already carry a fileUrl (desktop) pass through.
 */
export async function openWebMedia(entry: LocalVideo): Promise<string | null> {
  if (entry.fileUrl) return entry.fileUrl;
  if (!entry.id.startsWith('fs:')) return null;
  const blob = await readLibraryFile(entry.filePath);
  return blob ? URL.createObjectURL(blob) : null;
}
