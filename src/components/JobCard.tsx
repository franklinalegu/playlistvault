import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiAlertTriangle,
  FiChevronDown,
  FiExternalLink,
  FiFileText,
  FiFolder,
  FiPause,
  FiPlay,
  FiRefreshCw,
  FiTrash2,
  FiX
} from 'react-icons/fi';
import type { DownloadJob } from '@shared/types';
import { formatBytes, formatEta, formatSpeed } from '@shared/format';
import { ProgressBar, StatusPill } from './ui';

export function JobCard({
  job,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRetryItem
}: {
  job: DownloadJob;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRetryItem: (itemId: string) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const total = job.items.length;
  const done = job.items.filter((i) => i.status === 'completed' || i.status === 'skipped').length;
  const failed = job.items.filter((i) => i.status === 'failed').length;
  const overall = total === 0 ? 0 : job.items.reduce((s, i) => s + i.progress, 0) / total;
  const speed = job.items
    .filter((i) => i.status === 'downloading')
    .reduce((s, i) => s + i.speedBytesPerSecond, 0);
  const remaining = job.items
    .filter((i) => i.status !== 'completed' && i.status !== 'skipped')
    .reduce((s, i) => s + Math.max(0, i.totalBytes - i.downloadedBytes), 0);

  const isRunning = job.status === 'downloading' || job.status === 'queued';
  const isFinished = job.status === 'completed' || job.status === 'canceled' || job.status === 'failed';

  // Bulk failure detection: 0/N with same error on every item (systemic)
  const bulkError = (() => {
    if (failed === 0 || failed !== total || total === 0) return null;
    const first = job.items.find(i => i.status === 'failed')?.error;
    if (!first) return null;
    const allSame = job.items.every(i => i.status !== 'failed' || i.error === first);
    return allSame ? first : null;
  })();
  const isBulkSystemic = bulkError ? /yt-dlp|FFmpeg|failed to start|not found|out of date|signature/i.test(bulkError) : false;

  return (
    <motion.article layout className="glass overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="relative h-[62px] w-[110px] shrink-0 overflow-hidden rounded-lg bg-vault-800 shadow-inner">
          {job.playlistThumbnail && (
            <img src={job.playlistThumbnail} alt="" className="h-full w-full object-cover" />
          )}
          {job.status === 'downloading' && (
            <span className="absolute inset-0 bg-gradient-to-t from-accent-500/25 to-transparent" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-white">{job.playlistTitle}</h3>
              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                <StatusPill status={job.status} />
                <span className="tabular-nums">
                  {done}/{total} done{failed > 0 && ` · ${failed} failed`}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {isRunning && (
                <IconButton label="Pause" onClick={onPause}>
                  <FiPause className="h-4 w-4" />
                </IconButton>
              )}
              {job.status === 'paused' && (
                <IconButton label="Resume" onClick={onResume}>
                  <FiPlay className="h-4 w-4" />
                </IconButton>
              )}
              {(failed > 0 || job.status === 'failed' || job.status === 'canceled') && (
                <IconButton label="Retry failed" onClick={onRetry}>
                  <FiRefreshCw className="h-4 w-4" />
                </IconButton>
              )}
              {job.manifestPath && (
                <IconButton
                  label="Open resource links page"
                  onClick={() => void window.vault.system.openPath(job.manifestPath!)}
                >
                  <FiFileText className="h-4 w-4" />
                </IconButton>
              )}
              <IconButton
                label="Open folder"
                onClick={() => void window.vault.system.openPath(job.destination)}
              >
                <FiFolder className="h-4 w-4" />
              </IconButton>
              {!isFinished ? (
                <IconButton label="Cancel" danger onClick={onCancel}>
                  <FiX className="h-4 w-4" />
                </IconButton>
              ) : (
                <IconButton label="Remove" danger onClick={onCancel}>
                  <FiTrash2 className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          </div>

          {bulkError && (
            <div className={`mt-3 rounded-xl border px-3 py-2.5 ${isBulkSystemic ? 'border-amber-500/30 bg-amber-500/10' : 'border-rose-500/20 bg-rose-500/10'}`}>
              <div className="flex items-start gap-2">
                <FiAlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${isBulkSystemic ? 'text-amber-400' : 'text-rose-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${isBulkSystemic ? 'text-amber-100' : 'text-rose-100'}`}>
                    {isBulkSystemic ? 'All videos failed — system issue' : `All ${total} videos failed`}
                  </p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-slate-300/90">{bulkError}</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100">
                  <FiRefreshCw className="h-3.5 w-3.5" /> Retry all
                </button>
                {isBulkSystemic && /yt-dlp/i.test(bulkError) && (
                  <button
                    onClick={async () => {
                      const r = await window.vault.system.installDependency('yt-dlp');
                      if (!r.ok) window.dispatchEvent(new CustomEvent('pv-toast', { detail: { kind: 'error', title: 'Update failed', description: r.error } }));
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/15"
                  >
                    <FiRefreshCw className="h-3 w-3" /> Update yt-dlp
                  </button>
                )}
                {isBulkSystemic && /FFmpeg/i.test(bulkError) && (
                  <button
                    onClick={async () => {
                      const r = await window.vault.system.installDependency('ffmpeg');
                      if (!r.ok) window.dispatchEvent(new CustomEvent('pv-toast', { detail: { kind: 'error', title: 'Install failed', description: r.error } }));
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/15"
                  >
                    Install FFmpeg
                  </button>
                )}
                <button onClick={() => void window.vault.system.openLog().then(r => { if (!r.ok) console.error(r.error); })} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">
                  <FiFileText className="h-3 w-3" /> Open log
                </button>
                <button onClick={() => void window.vault.system.openExternal('https://github.com/franklinalegu/playlistvault/releases')} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">
                  <FiExternalLink className="h-3 w-3" /> Docs
                </button>
              </div>
            </div>
          )}

          <div className="mt-3">
            <ProgressBar value={overall} />
            <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-slate-500">
              <span>{overall.toFixed(1)}%</span>
              <span className="flex items-center gap-3">
                {speed > 0 && <span>{formatSpeed(speed)}</span>}
                {speed > 0 && remaining > 0 && (
                  <span>ETA {formatEta(Math.round(remaining / speed))}</span>
                )}
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-slate-400 transition hover:text-slate-200"
                >
                  {expanded ? 'Hide' : 'Details'}
                  <FiChevronDown
                    className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden border-t border-white/[0.07]"
          >
            <ul className="max-h-[300px] overflow-y-auto">
              {job.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2 last:border-0"
                >
                  <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-slate-600">
                    {item.index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-300">{item.title}</p>
                    {item.error ? (
                      <p className="truncate text-[11px] text-rose-400/80" title={item.error}>
                        {item.error}
                      </p>
                    ) : (
                      item.status === 'downloading' && (
                        <div className="mt-1">
                          <ProgressBar value={item.progress} className="h-1" />
                        </div>
                      )
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                    {item.totalBytes > 0 ? formatBytes(item.totalBytes) : ''}
                  </span>
                  <StatusPill status={item.status} />
                  {item.status === 'failed' && (
                    <IconButton label="Retry video" onClick={() => onRetryItem(item.id)}>
                      <FiRefreshCw className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function IconButton({
  children,
  label,
  onClick,
  danger = false
}: {
  children: JSX.Element;
  label: string;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-lg p-2 transition ${
        danger
          ? 'text-slate-500 hover:bg-rose-500/15 hover:text-rose-300'
          : 'text-slate-400 hover:bg-white/10 hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
