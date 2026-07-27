import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC } from '@shared/types';
import type {
  AnalyzeRequest,
  ApiResult,
  AppInfo,
  AppSettings,
  BinaryStatus,
  DependencyName,
  DependencyProgress,
  DownloadJob,
  HistoryEntry,
  JobProgressSnapshot,
  PlaylistInfo,
  StartJobRequest,
  UpdateState
} from '@shared/types';

/**
 * The single, explicitly-enumerated surface the renderer can touch.
 * No ipcRenderer, no Node globals, no dynamic channel names.
 */
const api = {
  playlist: {
    analyze: (req: AnalyzeRequest): Promise<ApiResult<PlaylistInfo>> =>
      ipcRenderer.invoke(IPC.playlistAnalyze, req),
    cancelAnalyze: (): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.playlistCancelAnalyze)
  },

  queue: {
    start: (req: StartJobRequest): Promise<ApiResult<DownloadJob>> =>
      ipcRenderer.invoke(IPC.queueStart, req),
    list: (): Promise<ApiResult<DownloadJob[]>> => ipcRenderer.invoke(IPC.queueList),
    pauseJob: (id: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.queuePauseJob, id),
    resumeJob: (id: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.queueResumeJob, id),
    cancelJob: (id: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.queueCancelJob, id),
    retryJob: (id: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.queueRetryJob, id),
    retryItem: (jobId: string, itemId: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.queueRetryItem, jobId, itemId),
    reorder: (ids: string[]): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.queueReorder, ids),
    clearFinished: (): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.queueClearFinished),

    onProgress: (cb: (snapshot: JobProgressSnapshot) => void): (() => void) =>
      subscribe(IPC.queueProgress, cb),
    onJobDone: (cb: (payload: { job: DownloadJob; entry: HistoryEntry }) => void): (() => void) =>
      subscribe(IPC.queueJobDone, cb)
  },

  history: {
    list: (): Promise<ApiResult<HistoryEntry[]>> => ipcRenderer.invoke(IPC.historyList),
    remove: (id: string): Promise<ApiResult<HistoryEntry[]>> =>
      ipcRenderer.invoke(IPC.historyRemove, id),
    clear: (): Promise<ApiResult<HistoryEntry[]>> => ipcRenderer.invoke(IPC.historyClear),
    toggleFavorite: (id: string): Promise<ApiResult<HistoryEntry[]>> =>
      ipcRenderer.invoke(IPC.historyToggleFavorite, id),
    exportCsv: (): Promise<ApiResult<string | null>> => ipcRenderer.invoke(IPC.historyExportCsv)
  },

  settings: {
    get: (): Promise<ApiResult<AppSettings>> => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<AppSettings>): Promise<ApiResult<AppSettings>> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    reset: (): Promise<ApiResult<AppSettings>> => ipcRenderer.invoke(IPC.settingsReset)
  },

  system: {
    chooseFolder: (current?: string): Promise<ApiResult<string | null>> =>
      ipcRenderer.invoke(IPC.dialogChooseFolder, current),
    openPath: (target: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.shellOpenPath, target),
    showItem: (target: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.shellShowItem, target),
    openExternal: (url: string): Promise<ApiResult<boolean>> =>
      ipcRenderer.invoke(IPC.shellOpenExternal, url),
    info: (): Promise<ApiResult<AppInfo>> => ipcRenderer.invoke(IPC.appInfo),
    checkBinaries: (): Promise<ApiResult<BinaryStatus[]>> =>
      ipcRenderer.invoke(IPC.appCheckBinaries),
    installDependency: (name: DependencyName): Promise<ApiResult<string>> =>
      ipcRenderer.invoke(IPC.appInstallDependency, name),
    openLog: (): Promise<ApiResult<boolean>> => ipcRenderer.invoke(IPC.appOpenLog),
    onDependencyProgress: (cb: (p: DependencyProgress) => void): (() => void) =>
      subscribe(IPC.appDependencyProgress, cb),
    onClipboardUrl: (cb: (url: string) => void): (() => void) =>
      subscribe(IPC.clipboardUrlDetected, cb)
  },

  updates: {
    check: (): Promise<ApiResult<boolean>> => ipcRenderer.invoke(IPC.updateCheck),
    install: (): Promise<ApiResult<boolean>> => ipcRenderer.invoke(IPC.updateInstall),
    onState: (cb: (state: UpdateState) => void): (() => void) => subscribe(IPC.updateState, cb)
  }
};

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('vault', api);

export type VaultApi = typeof api;
