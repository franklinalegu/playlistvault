import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import type { DownloadJob, JobProgressSnapshot } from '@shared/types';
import { useToast } from './ToastContext';

interface QueueContextValue {
  jobs: DownloadJob[];
  activeCount: number;
  refresh: () => Promise<void>;
  pauseJob: (id: string) => Promise<void>;
  resumeJob: (id: string) => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  retryJob: (id: string) => Promise<void>;
  retryItem: (jobId: string, itemId: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  clearFinished: () => Promise<void>;
}

const QueueContext = createContext<QueueContextValue | null>(null);

export function QueueProvider({ children }: { children: ReactNode }): JSX.Element {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    const res = await window.vault.queue.list();
    if (res.ok) setJobs(res.data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live progress: merge the snapshot into the matching job in place.
  useEffect(() => {
    const off = window.vault.queue.onProgress((snap: JobProgressSnapshot) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === snap.jobId);
        if (idx === -1) {
          void refresh();
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], status: snap.status, items: snap.items };
        return next;
      });
    });
    return off;
  }, [refresh]);

  useEffect(() => {
    const off = window.vault.queue.onJobDone(({ job, entry }) => {
      void refresh();
      toast({
        kind: entry.videosFailed > 0 ? 'warning' : 'success',
        title: entry.videosFailed > 0 ? 'Finished with errors' : 'Download complete',
        description: `${job.playlistTitle} — ${entry.videosCompleted} saved${
          entry.videosFailed ? `, ${entry.videosFailed} failed` : ''
        }.`,
        action: {
          label: 'Open folder',
          onClick: () => void window.vault.system.openPath(job.destination)
        }
      });
    });
    return off;
  }, [refresh, toast]);

  const wrap = useCallback(
    (fn: (...args: string[]) => Promise<{ ok: boolean; error?: string }>) =>
      async (...args: string[]) => {
        const res = await fn(...args);
        if (!res.ok) toast({ kind: 'error', title: 'Action failed', description: res.error });
        await refresh();
      },
    [refresh, toast]
  );

  const value = useMemo<QueueContextValue>(
    () => ({
      jobs,
      activeCount: jobs.filter(
        (j) => j.status === 'downloading' || j.status === 'queued' || j.status === 'converting'
      ).length,
      refresh,
      pauseJob: wrap((id) => window.vault.queue.pauseJob(id)),
      resumeJob: wrap((id) => window.vault.queue.resumeJob(id)),
      cancelJob: wrap((id) => window.vault.queue.cancelJob(id)),
      retryJob: wrap((id) => window.vault.queue.retryJob(id)),
      retryItem: async (jobId, itemId) => {
        await window.vault.queue.retryItem(jobId, itemId);
        await refresh();
      },
      reorder: async (ids) => {
        setJobs((prev) => ids.map((id) => prev.find((j) => j.id === id)!).filter(Boolean));
        await window.vault.queue.reorder(ids);
        await refresh();
      },
      clearFinished: async () => {
        await window.vault.queue.clearFinished();
        await refresh();
      }
    }),
    [jobs, refresh, wrap]
  );

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue(): QueueContextValue {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useQueue must be used inside <QueueProvider>');
  return ctx;
}
