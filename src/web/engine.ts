/**
 * In-browser download engine for the web/PWA build.
 *
 * Desktop has DownloadManager in the main process; the web vault used to just
 * park jobs as `queued` forever (the stuck-queue bug). This pumps them: one job
 * at a time, items sequentially, streaming each file from `/api/video` and
 * saving into the picked library folder (or a plain browser download as
 * fallback), with live progress through the same subscribers the Queue UI
 * listens on. Completions write history entries and fire job-done toasts,
 * exactly like desktop.
 */
import type { DownloadItem, DownloadJob, HistoryEntry } from '@shared/types';
import {
  appendHistory,
  emitJobDone,
  emitProgress,
  loadJobs,
  recordSave,
  safeFilename,
  saveJobs,
  videoFileUrl,
} from './store';
import { writeLibraryFile } from './fsLibrary';

const controllers = new Map<string, AbortController>();
let pumping = false;

/** Abort the in-flight fetch for a job (pause/cancel). The item goes back to queued. */
export function abortWebJob(jobId: string): void {
  controllers.get(jobId)?.abort();
  controllers.delete(jobId);
}

function sanitizeFolder(name: string): string {
  return name.replace(/[\\/:*?"<>|#%{}$!'@+`=]/g, '').trim().slice(0, 80) || 'PlaylistVault';
}

/** Load → patch → save → emit. Returns the updated job, if it still exists. */
function updateJob(jobId: string, patch: (j: DownloadJob) => DownloadJob): DownloadJob | null {
  const jobs = loadJobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx === -1) return null;
  const next = patch({ ...(jobs[idx] as DownloadJob) });
  const out = [...jobs];
  out[idx] = next;
  saveJobs(out);
  emitProgress(next);
  return next;
}

function updateItem(jobId: string, itemId: string, patch: (i: DownloadItem) => DownloadItem): DownloadJob | null {
  return updateJob(jobId, (j) => ({
    ...j,
    updatedAt: new Date().toISOString(),
    items: j.items.map((i) => (i.id === itemId ? patch({ ...i }) : i)),
  }));
}

/** Entry point: call after start/retry/resume and once at vault install. */
export function pumpWebQueue(): void {
  if (pumping) return;
  void runLoop().finally(() => {
    pumping = false;
  });
  pumping = true;
}

async function runLoop(): Promise<void> {
  for (;;) {
    const next = loadJobs().find((j) => j.status === 'queued');
    if (!next) return;
    await runJob(next.id);
  }
}

async function runJob(jobId: string): Promise<void> {
  const started = updateJob(jobId, (j) =>
    j.status === 'queued' ? { ...j, status: 'downloading', updatedAt: new Date().toISOString() } : j
  );
  if (!started || started.status !== 'downloading') return;

  const ctrl = new AbortController();
  controllers.set(jobId, ctrl);
  try {
    const snapshot = loadJobs().find((j) => j.id === jobId);
    const items = snapshot?.items ?? [];
    for (const item of items) {
      const cur = loadJobs().find((j) => j.id === jobId);
      if (!cur || cur.status !== 'downloading') return; // paused / cancelled mid-job
      const it = cur.items.find((i) => i.id === item.id);
      if (!it || it.status !== 'queued') continue;
      await downloadItem(cur, it, ctrl.signal);
    }
  } finally {
    controllers.delete(jobId);
  }

  const done = loadJobs().find((j) => j.id === jobId);
  if (!done || done.status !== 'downloading') return; // paused or removed

  const completed = done.items.filter((i) => i.status === 'completed').length;
  const failed = done.items.filter((i) => i.status === 'failed').length;
  const skipped = done.items.filter((i) => i.status === 'skipped').length;
  const now = new Date().toISOString();
  const totalBytes = done.items.reduce((s, i) => s + i.downloadedBytes, 0);

  const entry: HistoryEntry = {
    id: `web-hist-${Date.now().toString(36)}`,
    playlistTitle: done.playlistTitle,
    creator: '',
    thumbnail: done.playlistThumbnail,
    sourceUrl: done.sourceUrl,
    destination: done.destination,
    videosCompleted: completed,
    videosFailed: failed,
    videosSkipped: skipped,
    totalBytes,
    quality: done.options.quality,
    container: done.options.container,
    audioOnly: done.options.audioOnly,
    startedAt: done.createdAt,
    finishedAt: now,
    durationSeconds: Math.max(0, Math.round((Date.parse(now) - Date.parse(done.createdAt)) / 1000)),
    favorite: false,
  };
  appendHistory(entry);

  const finished: DownloadJob = {
    ...done,
    status: completed > 0 ? 'completed' : 'failed',
    updatedAt: now,
    completedAt: now,
  };
  const jobs = loadJobs().map((j) => (j.id === jobId ? finished : j));
  saveJobs(jobs);
  emitProgress(finished);
  emitJobDone(finished, entry);
}

async function downloadItem(job: DownloadJob, item: DownloadItem, signal: AbortSignal): Promise<void> {
  const source = item.sourceUrl ?? job.sourceUrl;
  if (!source) {
    updateItem(job.id, item.id, (i) => ({ ...i, status: 'failed', error: 'No source URL for this video.' }));
    return;
  }
  updateItem(job.id, item.id, (i) => ({
    ...i,
    status: 'downloading',
    progress: 0,
    downloadedBytes: 0,
    error: undefined,
    attempts: i.attempts + 1,
    startedAt: new Date().toISOString(),
  }));

  try {
    const res = await fetch(videoFileUrl(source, job.options.quality, job.options.audioOnly), { signal });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      throw new Error(
        'The download service is not running here. Serve the API (npx vercel dev), deploy the web app, or install the desktop app.'
      );
    }
    if (!res.body) throw new Error('Empty response from the download service.');

    const total = Number(res.headers.get('content-length') ?? 0) || 0;
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    const t0 = Date.now();
    let lastEmit = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
      }
      const now = Date.now();
      if (now - lastEmit > 400) {
        lastEmit = now;
        const elapsed = Math.max(0.5, (now - t0) / 1000);
        updateItem(job.id, item.id, (i) => ({
          ...i,
          downloadedBytes: received,
          totalBytes: total,
          progress: total > 0 ? Math.min(0.999, received / total) : received > 0 ? 0.02 : 0,
          speedBytesPerSecond: Math.round(received / elapsed),
        }));
      }
    }

    const filename = safeFilename(item.title, job.options.audioOnly);
    const subfolder = job.options.createPlaylistFolder ? sanitizeFolder(job.playlistTitle) : undefined;
    const mime = job.options.audioOnly ? 'audio/mpeg' : 'video/mp4';

    const libraryPath = await writeLibraryFile(filename, chunks, mime, subfolder);
    if (libraryPath) {
      recordSave({
        filename,
        title: item.title,
        bytes: received,
        savedAt: new Date().toISOString(),
        quality: job.options.quality,
        audioOnly: job.options.audioOnly,
        libraryPath,
      });
      updateItem(job.id, item.id, (i) => ({
        ...i,
        status: 'completed',
        progress: 1,
        downloadedBytes: received,
        totalBytes: total || received,
        outputPath: libraryPath,
        completedAt: new Date().toISOString(),
      }));
      return;
    }

    // Fallback: plain browser download (Firefox, iOS, or no folder picked).
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    recordSave({
      filename,
      title: item.title,
      bytes: received,
      savedAt: new Date().toISOString(),
      quality: job.options.quality,
      audioOnly: job.options.audioOnly,
      libraryPath: null,
    });
    updateItem(job.id, item.id, (i) => ({
      ...i,
      status: 'completed',
      progress: 1,
      downloadedBytes: received,
      totalBytes: total || received,
      outputPath: filename,
      completedAt: new Date().toISOString(),
    }));
  } catch (e) {
    if (signal.aborted) {
      // Pause/cancel: park the item back as queued (cancel removes the job anyway).
      updateItem(job.id, item.id, (i) =>
        i.status === 'downloading'
          ? { ...i, status: 'queued', progress: 0, speedBytesPerSecond: 0, etaSeconds: 0 }
          : i
      );
      return;
    }
    const message =
      e instanceof TypeError
        ? 'Network error — check your connection and retry.'
        : e instanceof Error
          ? e.message
          : 'Download failed.';
    updateItem(job.id, item.id, (i) => ({
      ...i,
      status: 'failed',
      error: message,
      speedBytesPerSecond: 0,
      completedAt: new Date().toISOString(),
    }));
  }
}
