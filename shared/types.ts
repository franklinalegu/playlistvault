/**
 * Shared domain types used by the Electron main process, the Node backend
 * services and the React renderer. Keep this file dependency-free so it can be
 * imported from any of the three contexts.
 */

export type ThemeMode = 'dark' | 'light' | 'system';

/** Download source platform. Extensible — add a platform here and in the URL parser. */
export type SourcePlatform = 'youtube' | 'udemy';

export type VideoQuality =
  | 'best'
  | '2160p'
  | '1440p'
  | '1080p'
  | '720p'
  | '480p'
  | '360p'
  | 'audio-only';

export type VideoContainer = 'mp4' | 'mkv' | 'webm';
export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav';
export type BrowserCookieSource = 'none' | 'chrome' | 'edge' | 'firefox';

export type DownloadStatus =
  | 'queued'
  | 'analyzing'
  | 'downloading'
  | 'converting'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'canceled';

export interface PlaylistVideo {
  id: string;
  title: string;
  durationSeconds: number;
  thumbnail?: string;
  uploader?: string;
  url: string;
  /** 1-based position within the playlist as reported by the source. */
  index: number;
  isAvailable: boolean;
  unavailableReason?: string;
  /**
   * For multi-part courses (e.g. Udemy): resolves this item by its playlist
   * position from `url` so yt-dlp extracts it with full course context
   * (chapter, playlist index) instead of as a detached single video.
   */
  playlistItems?: number;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  creator: string;
  /** Which platform this playlist was resolved from. */
  platform: SourcePlatform;
  channelUrl?: string;
  thumbnail?: string;
  description?: string;
  videoCount: number;
  totalDurationSeconds: number;
  /** Rough byte estimate for the currently selected quality. */
  estimatedBytes: number;
  videos: PlaylistVideo[];
  sourceUrl: string;
  fetchedAt: string;
}

export type SubtitleLanguage =
  | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'ja' | 'ko' | 'zh'
  | 'ar' | 'hi' | 'nl' | 'pl' | 'sv' | 'tr' | 'vi' | 'th' | 'uk' | 'id'
  | 'auto';

export type PostDownloadAction = 'none' | 'shutdown' | 'sleep' | 'hibernate';

export type OutputTemplate = 'default' | 'simple' | 'detailed' | 'custom';

export interface OutputTemplateConfig {
  preset: OutputTemplate;
  customPattern?: string;
}

export interface ProxyConfig {
  enabled: boolean;
  type: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface DownloadOptions {
  quality: VideoQuality;
  container: VideoContainer;
  audioFormat: AudioFormat;
  audioOnly: boolean;
  embedThumbnail: boolean;
  writeSubtitles: boolean;
  subtitleLanguages: string[];
  numberFiles: boolean;
  skipDuplicates: boolean;
  /** Write a clickable HTML manifest of every source link for the playlist. */
  writeResourceManifest: boolean;
  createPlaylistFolder: boolean;
  concurrency: number;
  rateLimitKbps?: number;
  /** Custom output template for filenames. */
  outputTemplate?: OutputTemplateConfig;
  /** Global speed limit in KB/s (0 = unlimited). */
  speedLimitKbps?: number;
  /** Post-download action. */
  postDownloadAction?: PostDownloadAction;
}

export interface DownloadItem {
  id: string;
  videoId: string;
  title: string;
  index: number;
  status: DownloadStatus;
  progress: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
  downloadedBytes: number;
  totalBytes: number;
  outputPath?: string;
  error?: string;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  /**
   * Internal: set once a post-processor reports the definitive output path,
   * so later per-stream destination lines cannot overwrite it.
   */
  finalPathKnown?: boolean;
}

export interface DownloadJob {
  id: string;
  playlistId: string;
  playlistTitle: string;
  playlistThumbnail?: string;
  sourceUrl: string;
  destination: string;
  options: DownloadOptions;
  status: DownloadStatus;
  items: DownloadItem[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Absolute path of the generated resource-links page, once written. */
  manifestPath?: string;
  /** Position in the queue; lower runs first. */
  order: number;
}

export interface JobProgressSnapshot {
  jobId: string;
  status: DownloadStatus;
  completed: number;
  failed: number;
  total: number;
  overallProgress: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
  items: DownloadItem[];
}

export interface HistoryEntry {
  id: string;
  playlistTitle: string;
  creator: string;
  thumbnail?: string;
  sourceUrl: string;
  destination: string;
  videosCompleted: number;
  videosFailed: number;
  videosSkipped: number;
  totalBytes: number;
  quality: VideoQuality;
  container: VideoContainer;
  audioOnly: boolean;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  favorite: boolean;
  manifestPath?: string;
}

export interface AppSettings {
  theme: ThemeMode;
  accentColor: string;
  defaultDestination: string;
  defaultOptions: DownloadOptions;
  maxConcurrentJobs: number;
  notificationsEnabled: boolean;
  notifyOnEachVideo: boolean;
  clipboardMonitoring: boolean;
  autoCheckUpdates: boolean;
  minimizeToTray: boolean;
  confirmBeforeQuit: boolean;
  keepHistoryDays: number;
  /** Most-recently used download folders, newest first. */
  recentDestinations: string[];
  ytDlpPath?: string;
  ffmpegPath?: string;
  legalAcknowledged: boolean;
  browserCookieSource: BrowserCookieSource;
  /**
   * Absolute path to a Netscape-format cookies.txt file, used for platforms
   * that need a signed-in session (e.g. Udemy courses). Browser cookie
   * extraction does not always cover these sites.
   */
  cookiesFile?: string;
  /** Proxy configuration for downloads. */
  proxy: ProxyConfig;
  /** Global download speed limit in KB/s (0 = unlimited). */
  globalSpeedLimitKbps: number;
  /** Post-download action for all jobs. */
  postDownloadAction: PostDownloadAction;
  /** Keyboard shortcuts enabled. */
  keyboardShortcutsEnabled: boolean;
  /** Show download speed in notification. */
  showSpeedInNotification: boolean;
  /** True once the guided first-run wizard has been completed. */
  firstRunComplete: boolean;
}

export type DependencyName = 'yt-dlp' | 'ffmpeg';

export interface DependencyProgress {
  name: DependencyName;
  stage: 'downloading' | 'extracting' | 'done' | 'error';
  percent: number;
  message: string;
}

export interface BinaryStatus {
  name: 'yt-dlp' | 'ffmpeg';
  found: boolean;
  path?: string;
  version?: string;
  error?: string;
}

/** Whether the installed yt-dlp is behind the newest release. */
export interface YtDlpUpdateStatus {
  current: string | null;
  latest: string | null;
  outdated: boolean;
}

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  userDataPath: string;
  /** Absolute path of the current log file, if logging started successfully. */
  logPath?: string;
  binaries: BinaryStatus[];
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';
  version?: string;
  percent?: number;
  message?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export interface AnalyzeRequest {
  url: string;
  quality: VideoQuality;
  browserCookieSource?: BrowserCookieSource;
}

export interface StartJobRequest {
  playlist: PlaylistInfo;
  selectedVideoIds: string[];
  destination: string;
  options: DownloadOptions;
}

/** Channel names for main <-> renderer IPC. */
export const IPC = {
  playlistAnalyze: 'playlist:analyze',
  playlistCancelAnalyze: 'playlist:cancel-analyze',

  queueStart: 'queue:start',
  queueList: 'queue:list',
  queuePauseJob: 'queue:pause-job',
  queueResumeJob: 'queue:resume-job',
  queueCancelJob: 'queue:cancel-job',
  queueRetryJob: 'queue:retry-job',
  queueRetryItem: 'queue:retry-item',
  queueReorder: 'queue:reorder',
  queueClearFinished: 'queue:clear-finished',
  queueProgress: 'queue:progress',
  queueJobDone: 'queue:job-done',

  historyList: 'history:list',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  historyToggleFavorite: 'history:toggle-favorite',
  historyExportCsv: 'history:export-csv',
  historyExportJson: 'history:export-json',
  historySearch: 'history:search',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',

  dialogChooseFolder: 'dialog:choose-folder',
  dialogChooseFile: 'dialog:choose-file',
  shellOpenPath: 'shell:open-path',
  shellShowItem: 'shell:show-item',
  shellOpenExternal: 'shell:open-external',

  appInfo: 'app:info',
  appCheckBinaries: 'app:check-binaries',
  appInstallDependency: 'app:install-dependency',
  appOpenLog: 'app:open-log',
  appDependencyProgress: 'app:dependency-progress',
  ytdlpCheckUpdate: 'ytdlp:check-update',
  authTest: 'auth:test',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateState: 'update:state',

  clipboardUrlDetected: 'clipboard:url-detected',
  protocolUrlDetected: 'protocol:url-detected',

  batchImportUrls: 'batch:import-urls',
  batchParseFile: 'batch:parse-file',

  shutdownSchedule: 'shutdown:schedule',
  shutdownCancel: 'shutdown:cancel'
} as const;

export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = {
  quality: '1080p',
  container: 'mp4',
  audioFormat: 'mp3',
  audioOnly: false,
  embedThumbnail: true,
  writeSubtitles: false,
  subtitleLanguages: ['en'],
  numberFiles: true,
  skipDuplicates: true,
  writeResourceManifest: true,
  createPlaylistFolder: true,
  concurrency: 2,
  outputTemplate: { preset: 'default' },
  speedLimitKbps: 0,
  postDownloadAction: 'none'
};
