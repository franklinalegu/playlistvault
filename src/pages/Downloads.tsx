import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, Reorder } from 'framer-motion';
import { FiInbox, FiTrash2 } from 'react-icons/fi';
import type { DownloadJob } from '@shared/types';
import { useQueue } from '@/contexts/QueueContext';
import { JobCard } from '@/components/JobCard';
import { EmptyState, PageShell } from '@/components/ui';

type Filter = 'all' | 'active' | 'finished';

export function Downloads(): JSX.Element {
  const { jobs, pauseJob, resumeJob, cancelJob, retryJob, retryItem, reorder, clearFinished } =
    useQueue();
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    if (filter === 'active') {
      return jobs.filter((j) => !['completed', 'canceled', 'failed'].includes(j.status));
    }
    if (filter === 'finished') {
      return jobs.filter((j) => ['completed', 'canceled', 'failed'].includes(j.status));
    }
    return jobs;
  }, [jobs, filter]);

  const hasFinished = jobs.some((j) => ['completed', 'canceled', 'failed'].includes(j.status));

  return (
    <PageShell
      title="Downloads"
      subtitle="Drag cards to reorder the queue. Jobs run from the top down."
      actions={
        hasFinished ? (
          <button onClick={() => void clearFinished()} className="btn-ghost">
            <FiTrash2 className="h-4 w-4" />
            Clear finished
          </button>
        ) : undefined
      }
    >
      <div className="mb-5 flex gap-1.5">
        {(['all', 'active', 'finished'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              filter === f
                ? 'bg-accent/20 text-accent-200'
                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<FiInbox />}
          title={filter === 'all' ? 'The queue is empty' : `No ${filter} downloads`}
          description="Analyze a playlist on the Home page to add it to the download queue."
          action={
            <Link to="/" className="btn-primary">
              Go to Home
            </Link>
          }
        />
      ) : (
        <Reorder.Group
          axis="y"
          values={visible}
          onReorder={(next: DownloadJob[]) => void reorder(next.map((j) => j.id))}
          className="space-y-4"
        >
          <AnimatePresence initial={false}>
            {visible.map((job) => (
              <Reorder.Item
                key={job.id}
                value={job}
                dragListener={filter === 'all'}
                className="cursor-grab active:cursor-grabbing"
              >
                <JobCard
                  job={job}
                  onPause={() => void pauseJob(job.id)}
                  onResume={() => void resumeJob(job.id)}
                  onCancel={() => void cancelJob(job.id)}
                  onRetry={() => void retryJob(job.id)}
                  onRetryItem={(itemId) => void retryItem(job.id, itemId)}
                />
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}
    </PageShell>
  );
}
