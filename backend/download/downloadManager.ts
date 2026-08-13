import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  DownloadItem,
  BrowserCookieSource,
  DownloadJob,
  DownloadOptions,
  JobProgressSnapshot,
  HistoryEntry,
  PlaylistInfo,
  PlaylistVideo,
  ProxyConfig
} from '@shared/types';
import { buildDownloadArgs } from './formats.js';
import { runYtDlp, humanizeYtDlpError } from './ytdlp.js';
import { parseProgressLine } from './progress.js';
import { padIndex, sanitizeFilename, isSafeDestination } from '../util/sanitize.js';
import { parseSourceUrl } from '../util/platform.js';
import { findInfoJson, readVideoLinks, cleanupInfoJson, type VideoLinks } from '../manifest/linkExtractor.js';
import { writeManifest } from '../manifest/manifestWriter.js';
import { log } from '../util/logger.js';
import { resolveBinaries } from '../ffmpeg/binaries.js';

const MAX_ATTEMPTS = 3;
const PROGRESS_THROTTLE_MS = 250;

interface ActiveProcess {
  kill: (signal?: NodeJS.Signals) => void;
}

export interface DownloadManagerEvents {
  progress: (snapshot: JobProgressSnapshot) => void;
  jobDone: (job: DownloadJob, history: HistoryEntry) => void;
  itemDone: (job: DownloadJob, item: DownloadItem) => void;
}

/**
 * Owns the download queue. One job = one playlist; each job runs its items
 * with a bounded concurrency. Jobs themselves run sequentially by default so
 * we don't saturate the connection (configurable via maxConcurrentJobs).
 */
export class DownloadManager extends EventEmitter {
  private jobs = new Map<string, DownloadJob>();
  private active = new Map<string, ActiveProcess>();
  private pausedJobs = new Set<string>();
  private cancelledJobs = new Set<string>();
  private runningJobs = new Set<string>();
  private lastEmit = new Map<string, number>();
  private maxConcurrentJobs = 1;
  private orderCounter = 0;
  private browserCookieSource: BrowserCookieSource = 'none';
  private cookiesFile?: string;
  private proxy: ProxyConfig | undefined;
  private globalSpeedLimitKbps = 0;

  setMaxConcurrentJobs(n: number): void {
    this.maxConcurrentJobs = Math.min(4, Math.max(1, n));
    void this.pump();
  }

  setBrowserCookieSource(source: BrowserCookieSource): void {
    this.browserCookieSource = source;
  }

  setCookiesFile(cookiesFile?: string): void {
    this.cookiesFile = cookiesFile?.trim() || undefined;
  }

  setProxy(proxy: ProxyConfig | undefined): void {
    this.proxy = proxy;
  }

  setGlobalSpeedLimit(kbps: number): void {
    this.globalSpeedLimitKbps = Math.max(0, kbps);
  }

  list(): DownloadJob[] {
    return [...this.jobs.values()].sort((a, b) => a.order - b.order);
  }

  get(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  /** Queue a playlist. Returns immediately; work happens in the background. */
  enqueue(params: {
    playlist: PlaylistInfo;
    selectedVideoIds: string[];
    destination: string;
    options: DownloadOptions;
  }): DownloadJob {
    const { playlist, selectedVideoIds, destination, options } = params;

    if (!isSafeDestination(destination)) {
      throw new Error('That destination folder is not allowed. Choose a different folder.');
    }

    const selected = new Set(selectedVideoIds);
    const videos = playlist.videos.filter((v) => selected.has(v.id) && v.isAvailable);
    if (!videos.length) {
      throw new Error('No downloadable videos were selected.');
    }

    const now = new Date().toISOString();
    const job: DownloadJob = {
      id: randomUUID(),
      playlistId: playlist.id,
      playlistTitle: playlist.title,
      playlistThumbnail: playlist.thumbnail,
      sourceUrl: playlist.sourceUrl,
      destination: this.resolveJobFolder(destination, playlist.title, options),
      options,
      status: 'queued',
      order: this.orderCounter++,
      createdAt: now,
      updatedAt: now,
      items: videos.map<DownloadItem>((video, i) => ({
        id: randomUUID(),
        videoId: video.id,
        title: video.title,
        index: options.numberFiles ? i + 1 : video.index,
        status: 'queued',
        progress: 0,
        speedBytesPerSecond: 0,
        etaSeconds: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        attempts: 0
      }))
    };

    // Keep the source video URLs alongside the items for the runner.
    this.urlIndex.set(job.id, new Map(videos.map((v) => [v.id, v])));
    this.jobs.set(job.id, job);
    this.emitProgress(job, true);
    void this.pump();
    return job;
  }

  private urlIndex = new Map<string, Map<string, PlaylistVideo>>();

  pauseJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed') return;
    this.pausedJobs.add(jobId);
    job.status = 'paused';
    // Killing mid-download is safe: yt-dlp keeps .part files and resumes.
    for (const item of job.items) {
      if (item.status === 'downloading' || item.status === 'converting') {
        this.active.get(item.id)?.kill();
        item.status = 'paused';
      }
    }
    this.touch(job);
    this.emitProgress(job, true);
  }

  resumeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.pausedJobs.delete(jobId);
    this.cancelledJobs.delete(jobId);
    for (const item of job.items) {
      if (item.status === 'paused') item.status = 'queued';
    }
    job.status = 'queued';
    this.touch(job);
    this.emitProgress(job, true);
    void this.pump();
  }

  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.cancelledJobs.add(jobId);
    this.pausedJobs.delete(jobId);
    for (const item of job.items) {
      if (item.status === 'downloading' || item.status === 'converting') {
        this.active.get(item.id)?.kill();
      }
      if (item.status !== 'completed') item.status = 'canceled';
    }
    job.status = 'canceled';
    this.touch(job);
    this.emitProgress(job, true);
  }

  retryJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.cancelledJobs.delete(jobId);
    this.pausedJobs.delete(jobId);
    for (const item of job.items) {
      if (item.status === 'failed' || item.status === 'canceled') {
        item.status = 'queued';
        item.attempts = 0;
        item.error = undefined;
        item.progress = 0;
      }
    }
    job.status = 'queued';
    job.completedAt = undefined;
    this.touch(job);
    this.emitProgress(job, true);
    void this.pump();
  }

  retryItem(jobId: string, itemId: string): void {
    const job = this.jobs.get(jobId);
    const item = job?.items.find((i) => i.id === itemId);
    if (!job || !item) return;
    item.status = 'queued';
    item.attempts = 0;
    item.error = undefined;
    item.progress = 0;
    if (job.status === 'completed' || job.status === 'failed') job.status = 'queued';
    this.cancelledJobs.delete(jobId);
    this.touch(job);
    this.emitProgress(job, true);
    void this.pump();
  }

  reorder(jobIds: string[]): void {
    jobIds.forEach((id, i) => {
      const job = this.jobs.get(id);
      if (job) job.order = i;
    });
    this.orderCounter = Math.max(this.orderCounter, jobIds.length);
    void this.pump();
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'canceled' || job.status === 'failed') {
        this.jobs.delete(id);
        this.urlIndex.delete(id);
      }
    }
  }

  /** Start any jobs that are eligible to run. */
  private async pump(): Promise<void> {
    if (this.runningJobs.size >= this.maxConcurrentJobs) return;
    const next = this.list().find(
      (job) =>
        !this.runningJobs.has(job.id) &&
        !this.pausedJobs.has(job.id) &&
        !this.cancelledJobs.has(job.id) &&
        job.items.some((i) => i.status === 'queued')
    );
    if (!next) return;

    this.runningJobs.add(next.id);
    void this.runJob(next)
      .catch(() => undefined)
      .finally(() => {
        this.runningJobs.delete(next.id);
        void this.pump();
      });

    // Another job may still fit under the concurrency cap.
    if (this.runningJobs.size < this.maxConcurrentJobs) void this.pump();
  }

  private async runJob(job: DownloadJob): Promise<void> {
    const startedAt = job.items.find((i) => i.startedAt)?.startedAt ?? new Date().toISOString();
    job.status = 'downloading';
    this.touch(job);

    // Create the destination up front. If the drive is missing, read-only or
    // permission-denied this is where we find out — and the user must be told,
    // otherwise the job would sit at "downloading" forever.
    try {
      await fsp.mkdir(job.destination, { recursive: true });
      await this.assertWritable(job.destination);
    } catch (error) {
      const message = describeDestinationError(error, job.destination);
      log.error('download', `destination unusable: ${job.destination} -> ${message}`);
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      for (const item of job.items) {
        if (item.status === 'queued') {
          item.status = 'failed';
          item.error = message;
        }
      }
      this.touch(job);
      this.emitProgress(job, true);
      this.emit('jobDone', job, this.toHistoryEntry(job, startedAt));
      return;
    }

    const concurrency = Math.min(Math.max(1, job.options.concurrency), 6);
    const queue = job.items.filter((i) => i.status === 'queued');
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        if (this.pausedJobs.has(job.id) || this.cancelledJobs.has(job.id)) return;
        const item = queue[cursor++];
        if (!item || item.status !== 'queued') continue;
        await this.runItem(job, item);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    if (this.cancelledJobs.has(job.id)) {
      job.status = 'canceled';
    } else if (this.pausedJobs.has(job.id)) {
      job.status = 'paused';
    } else {
      const failed = job.items.filter((i) => i.status === 'failed').length;
      const pending = job.items.some((i) => i.status === 'queued' || i.status === 'paused');
      if (pending) {
        job.status = 'queued';
      } else {
        job.status = failed > 0 ? 'failed' : 'completed';
        job.completedAt = new Date().toISOString();
      }
    }

    // Build the resource-links page before announcing completion, so the
    // history entry and the finished notification can both point at it.
    if (job.options.writeResourceManifest &&
        (job.status === 'completed' || job.status === 'failed')) {
      await this.writeResourceManifest(job).catch((error) => {
        log.error('manifest', error);
      });
    }

    this.touch(job);
    this.emitProgress(job, true);

    if (job.status === 'completed' || job.status === 'failed') {
      this.emit('jobDone', job, this.toHistoryEntry(job, startedAt));
    }
  }

  /**
   * Collect every downloaded video's source links into one HTML page.
   *
   * Rows are tiled against the real files: each entry carries the exact
   * basename written to disk, so the manifest sits beside the media and links
   * straight to it.
   */
  private async writeResourceManifest(job: DownloadJob): Promise<void> {
    const index = this.urlIndex.get(job.id);
    const infoPaths: (string | null)[] = [];
    const videos: VideoLinks[] = [];

    const included = job.items.filter(
      (i) => i.status === 'completed' || i.status === 'skipped'
    );
    if (!included.length) return;

    for (const item of included) {
      // Skipped items were never fetched this run, so their info JSON may be
      // absent; findInfoJson still locates one left by an earlier download.
      const infoPath = item.outputPath ? await findInfoJson(item.outputPath) : null;
      infoPaths.push(infoPath);
      videos.push(
        await readVideoLinks({
          infoJsonPath: infoPath,
          fallbackId: item.videoId,
          fallbackTitle: item.title,
          fileName: item.outputPath ? path.basename(item.outputPath) : undefined,
          fallbackUrl: index?.get(item.videoId)?.url
        })
      );
    }

    const { htmlPath } = await writeManifest(job.destination, {
      playlistTitle: job.playlistTitle,
      creator: videos.find((v) => v.channelName)?.channelName ?? 'Unknown creator',
      sourceUrl: job.sourceUrl,
      destination: job.destination,
      generatedAt: new Date().toISOString(),
      quality: job.options.quality,
      container: job.options.audioOnly ? job.options.audioFormat : job.options.container,
      audioOnly: job.options.audioOnly
    }, videos);

    job.manifestPath = htmlPath;

    // The sidecars have served their purpose; leave the folder tidy.
    await cleanupInfoJson(infoPaths);
  }

  /** Prove we can actually create a file here, not just that the path exists. */
  private async assertWritable(dir: string): Promise<void> {
    const probe = path.join(dir, `.playlistvault-write-test-${process.pid}`);
    await fsp.writeFile(probe, '');
    await fsp.rm(probe, { force: true });
  }

  private async runItem(job: DownloadJob, item: DownloadItem): Promise<void> {
    const video = this.urlIndex.get(job.id)?.get(item.videoId);
    if (!video) {
      item.status = 'failed';
      item.error = 'Video reference was lost. Re-analyze the playlist.';
      return;
    }

    // Duplicate skipping: if a matching file already exists we don't re-fetch.
    if (job.options.skipDuplicates) {
      const existing = await this.findExisting(job, item);
      if (existing) {
        item.status = 'skipped';
        item.progress = 100;
        item.outputPath = existing;
        this.emitProgress(job);
        this.emit('itemDone', job, item);
        return;
      }
    }

    while (item.attempts < MAX_ATTEMPTS) {
      if (this.pausedJobs.has(job.id) || this.cancelledJobs.has(job.id)) {
        item.status = this.cancelledJobs.has(job.id) ? 'canceled' : 'paused';
        return;
      }

      item.attempts += 1;
      item.status = 'downloading';
      item.error = undefined;
      item.finalPathKnown = false;
      item.startedAt = item.startedAt ?? new Date().toISOString();
      this.emitProgress(job);

      const outputTemplate = this.buildOutputTemplate(job, item, video);
      const args = buildDownloadArgs({
        url: video.url,
        outputTemplate,
        options: job.options,
        ffmpegPath: resolveBinaries().ffmpeg,
        browserCookieSource: this.browserCookieSource,
        cookiesFile: this.cookiesFile,
        proxy: this.proxy,
        globalSpeedLimitKbps: this.globalSpeedLimitKbps,
        playlistItems: video.playlistItems
      });

      const handle = runYtDlp(args, {
        onStdoutLine: (line) => this.applyProgress(job, item, line)
      });
      this.active.set(item.id, handle);

      let result: { code: number | null; stderr: string };
      try {
        result = await handle.done;
      } catch (error) {
        result = {
          code: -1,
          stderr: error instanceof Error ? error.message : String(error)
        };
      } finally {
        this.active.delete(item.id);
      }

      if (this.cancelledJobs.has(job.id)) {
        item.status = 'canceled';
        return;
      }
      if (this.pausedJobs.has(job.id)) {
        item.status = 'paused';
        return;
      }

      if (result.code === 0) {
        item.status = 'completed';
        item.progress = 100;
        item.speedBytesPerSecond = 0;
        item.etaSeconds = 0;
        item.completedAt = new Date().toISOString();

        // Intermediate fragments are deleted after merging, so confirm the
        // recorded path survived; if not, locate the real output on disk.
        if (!item.outputPath || !(await exists(item.outputPath))) {
          item.outputPath = (await this.findExisting(job, item)) ?? item.outputPath;
        }
        if (item.outputPath) {
          item.totalBytes = (await fileSize(item.outputPath)) || item.totalBytes;
          item.downloadedBytes = item.totalBytes;
        }
        this.emitProgress(job, true);
        this.emit('itemDone', job, item);
        return;
      }

      const message = humanizeYtDlpError(result.stderr, result.code);
      item.error = message;
      log.warn('download', `"${item.title}" attempt ${item.attempts} failed: ${message}`);

      // Some failures will never succeed on retry — stop burning attempts.
      if (isPermanentFailure(message) || item.attempts >= MAX_ATTEMPTS) {
        item.status = 'failed';
        this.emitProgress(job, true);
        this.emit('itemDone', job, item);
        return;
      }

      // Exponential backoff before the next attempt.
      await delay(1500 * item.attempts);
    }
  }

  private applyProgress(job: DownloadJob, item: DownloadItem, line: string): void {
    const sample = parseProgressLine(line);
    if (!sample) return;

    // A post-processor's path is authoritative; a plain [download]
    // destination may be an intermediate stream (e.g. video.f258.m4a).
    if (sample.finalPath) {
      item.outputPath = sample.finalPath;
      item.finalPathKnown = true;
    } else if (sample.destination && !item.finalPathKnown) {
      item.outputPath = sample.destination;
    }
    if (sample.postProcessing) {
      item.status = 'converting';
      item.speedBytesPerSecond = 0;
      this.emitProgress(job);
      return;
    }
    if (sample.percent !== undefined) item.progress = sample.percent;
    if (sample.totalBytes) item.totalBytes = sample.totalBytes;
    if (sample.downloadedBytes) item.downloadedBytes = sample.downloadedBytes;
    if (sample.speedBytesPerSecond !== undefined) {
      item.speedBytesPerSecond = sample.speedBytesPerSecond;
    }
    if (sample.etaSeconds !== undefined) item.etaSeconds = sample.etaSeconds;

    this.emitProgress(job);
  }

  /** Build a yt-dlp -o template, preserving exact titles for course platforms. */
  private buildOutputTemplate(job: DownloadJob, item: DownloadItem, video?: PlaylistVideo): string {
    if (parseSourceUrl(job.sourceUrl).platform === 'udemy') {
      // Course lectures: keep the exact lecture title and group by course
      // chapter. Fields resolve from the full course extraction at download
      // time (see playlistItems in buildDownloadArgs).
      if (video?.playlistItems !== undefined) {
        return path.join(
          job.destination,
          '%(chapter_number)02d - %(chapter)s/%(playlist_index)03d - %(title)s.%(ext)s'
        );
      }
      return path.join(job.destination, '%(title)s.%(ext)s');
    }

    const safeTitle = sanitizeFilename(item.title);
    const prefix = job.options.numberFiles
      ? `${padIndex(item.index, job.items.length)} - `
      : '';
    // %(ext)s is a yt-dlp placeholder, not user input.
    return path.join(job.destination, `${prefix}${safeTitle}.%(ext)s`);
  }

  private resolveJobFolder(
    destination: string,
    playlistTitle: string,
    options: DownloadOptions
  ): string {
    if (!options.createPlaylistFolder) return path.resolve(destination);
    return path.join(path.resolve(destination), sanitizeFilename(playlistTitle, 80));
  }

  /** Look for an already-downloaded file matching this item's base name. */
  private async findExisting(job: DownloadJob, item: DownloadItem): Promise<string | undefined> {
    const safeTitle = sanitizeFilename(item.title);
    const prefix = job.options.numberFiles
      ? `${padIndex(item.index, job.items.length)} - `
      : '';
    const base = `${prefix}${safeTitle}`;
    try {
      const files = await fsp.readdir(job.destination);
      const match = files.find(
        (f) => f.startsWith(base) && !f.endsWith('.part') && !f.endsWith('.ytdl')
      );
      return match ? path.join(job.destination, match) : undefined;
    } catch {
      return undefined;
    }
  }

  private toHistoryEntry(job: DownloadJob, startedAt: string): HistoryEntry {
    const finishedAt = job.completedAt ?? new Date().toISOString();
    return {
      id: job.id,
      playlistTitle: job.playlistTitle,
      creator: '',
      thumbnail: job.playlistThumbnail,
      sourceUrl: job.sourceUrl,
      destination: job.destination,
      videosCompleted: job.items.filter((i) => i.status === 'completed').length,
      videosFailed: job.items.filter((i) => i.status === 'failed').length,
      videosSkipped: job.items.filter((i) => i.status === 'skipped').length,
      totalBytes: job.items.reduce((sum, i) => sum + (i.totalBytes || 0), 0),
      quality: job.options.quality,
      container: job.options.container,
      audioOnly: job.options.audioOnly,
      manifestPath: job.manifestPath,
      startedAt,
      finishedAt,
      durationSeconds: Math.max(
        0,
        Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      ),
      favorite: false
    };
  }

  snapshot(job: DownloadJob): JobProgressSnapshot {
    const total = job.items.length;
    const completed = job.items.filter(
      (i) => i.status === 'completed' || i.status === 'skipped'
    ).length;
    const failed = job.items.filter((i) => i.status === 'failed').length;
    const overallProgress =
      total === 0 ? 0 : job.items.reduce((sum, i) => sum + i.progress, 0) / total;
    const speed = job.items
      .filter((i) => i.status === 'downloading')
      .reduce((sum, i) => sum + i.speedBytesPerSecond, 0);
    const remainingBytes = job.items
      .filter((i) => i.status !== 'completed' && i.status !== 'skipped')
      .reduce((sum, i) => sum + Math.max(0, i.totalBytes - i.downloadedBytes), 0);

    return {
      jobId: job.id,
      status: job.status,
      completed,
      failed,
      total,
      overallProgress,
      speedBytesPerSecond: speed,
      etaSeconds: speed > 0 ? Math.round(remainingBytes / speed) : 0,
      items: job.items
    };
  }

  /** Throttled so a 500-video playlist doesn't flood the IPC channel. */
  private emitProgress(job: DownloadJob, force = false): void {
    const now = Date.now();
    const last = this.lastEmit.get(job.id) ?? 0;
    if (!force && now - last < PROGRESS_THROTTLE_MS) return;
    this.lastEmit.set(job.id, now);
    this.emit('progress', this.snapshot(job));
  }

  private touch(job: DownloadJob): void {
    job.updatedAt = new Date().toISOString();
  }

  /** Stop everything (called on app quit). */
  shutdown(): void {
    for (const proc of this.active.values()) proc.kill();
    this.active.clear();
  }
}

/**
 * Turn a filesystem error into something the user can act on. The common real
 * cases are an unplugged/unmapped drive letter and a folder they lack rights to.
 */
function describeDestinationError(error: unknown, destination: string): string {
  const code = (error as NodeJS.ErrnoException)?.code ?? '';
  const drive = /^[a-zA-Z]:/.exec(destination)?.[0];
  const where = drive ? `Drive ${drive.toUpperCase()}` : 'The destination';

  switch (code) {
    case 'ENOENT':
    case 'ENXIO':
    case 'ENODEV':
      return `${where} was not found. If it is a USB or network drive, reconnect it and retry.`;
    case 'EACCES':
    case 'EPERM':
      return `Permission denied writing to "${destination}". Choose a folder inside your user profile, or run as administrator.`;
    case 'EROFS':
      return `${where} is read-only. Pick a different location.`;
    case 'ENOSPC':
      return `${where} is out of free space.`;
    case 'ENAMETOOLONG':
      return 'That folder path is too long for Windows. Pick a shorter path.';
    case 'EBUSY':
      return `${where} is busy or locked by another program.`;
    case 'ENOTDIR':
      return `The destination path contains a file where a folder is required. Pick a different folder.`;
    default:
      return `Could not write to "${destination}"${code ? ` (${code})` : ''}. Pick a different folder.`;
  }
}

function isPermanentFailure(message: string): boolean {
  return /private|members-only|unavailable|removed|age-restricted|not allowed|out of free space|Permission denied|was not found|read-only|too long for Windows/i.test(
    message
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(p: string): Promise<number> {
  try {
    const stat = await fsp.stat(p);
    return stat.size;
  } catch {
    return 0;
  }
}
