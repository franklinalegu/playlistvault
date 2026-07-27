import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FiClock,
  FiDownloadCloud,
  FiExternalLink,
  FiFileText,
  FiFolder,
  FiSearch,
  FiStar,
  FiTrash2
} from 'react-icons/fi';
import type { HistoryEntry } from '@shared/types';
import { formatBytes, formatLongDuration } from '@shared/format';
import { useToast } from '@/contexts/ToastContext';
import { EmptyState, PageShell } from '@/components/ui';

export function History(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { success, error } = useToast();

  const load = useCallback(async () => {
    const res = await window.vault.history.list();
    if (res.ok) setEntries(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (favoritesOnly && !e.favorite) return false;
      if (!q) return true;
      return (
        e.playlistTitle.toLowerCase().includes(q) ||
        e.creator.toLowerCase().includes(q) ||
        e.destination.toLowerCase().includes(q)
      );
    });
  }, [entries, query, favoritesOnly]);

  const totals = useMemo(
    () => ({
      videos: entries.reduce((s, e) => s + e.videosCompleted, 0),
      bytes: entries.reduce((s, e) => s + e.totalBytes, 0)
    }),
    [entries]
  );

  const exportCsv = async (): Promise<void> => {
    const res = await window.vault.history.exportCsv();
    if (res.ok && res.data) success('History exported', res.data);
    else if (!res.ok) error('Export failed', res.error);
  };

  return (
    <PageShell
      title="History"
      subtitle={
        entries.length
          ? `${entries.length} downloads · ${totals.videos} videos · ${formatBytes(totals.bytes)}`
          : 'Completed downloads appear here.'
      }
      actions={
        entries.length > 0 ? (
          <>
            <button onClick={() => void exportCsv()} className="btn-ghost">
              <FiDownloadCloud className="h-4 w-4" />
              Export CSV
            </button>
            <button
              onClick={async () => {
                const res = await window.vault.history.clear();
                if (res.ok) {
                  setEntries(res.data);
                  success('History cleared');
                }
              }}
              className="btn-danger"
            >
              <FiTrash2 className="h-4 w-4" />
              Clear
            </button>
          </>
        ) : undefined
      }
    >
      {entries.length > 0 && (
        <div className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              aria-label="Search history"
              className="input pl-10"
            />
          </div>
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`btn-ghost shrink-0 ${favoritesOnly ? 'border-amber-400/40 text-amber-300' : ''}`}
          >
            <FiStar className={`h-4 w-4 ${favoritesOnly ? 'fill-current' : ''}`} />
            Favorites
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<FiClock />}
          title={entries.length ? 'Nothing matches that filter' : 'No downloads yet'}
          description={
            entries.length
              ? 'Try a different search term or turn off the favorites filter.'
              : 'Once a playlist finishes downloading it will be recorded here.'
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((entry, i) => (
            <motion.article
              key={entry.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="glass glass-hover flex items-center gap-4 p-4"
            >
              <div className="h-[52px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-vault-800">
                {entry.thumbnail && (
                  <img src={entry.thumbnail} alt="" className="h-full w-full object-cover" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-white">{entry.playlistTitle}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>{new Date(entry.finishedAt).toLocaleString()}</span>
                  <span className="tabular-nums">{entry.videosCompleted} videos</span>
                  {entry.videosFailed > 0 && (
                    <span className="text-rose-400/80">{entry.videosFailed} failed</span>
                  )}
                  {entry.videosSkipped > 0 && (
                    <span className="text-violet-400/80">{entry.videosSkipped} skipped</span>
                  )}
                  <span className="tabular-nums">{formatBytes(entry.totalBytes)}</span>
                  <span className="chip py-0">{entry.audioOnly ? entry.container : entry.quality}</span>
                  <span>took {formatLongDuration(entry.durationSeconds)}</span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={async () => {
                    const res = await window.vault.history.toggleFavorite(entry.id);
                    if (res.ok) setEntries(res.data);
                  }}
                  title="Toggle favorite"
                  aria-label="Toggle favorite"
                  className={`rounded-lg p-2 transition hover:bg-white/10 ${
                    entry.favorite ? 'text-amber-400' : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  <FiStar className={`h-4 w-4 ${entry.favorite ? 'fill-current' : ''}`} />
                </button>
                {entry.manifestPath && (
                  <button
                    onClick={() => void window.vault.system.openPath(entry.manifestPath!)}
                    title="Open resource links page"
                    aria-label="Open resource links page"
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                  >
                    <FiFileText className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => void window.vault.system.openPath(entry.destination)}
                  title="Open folder"
                  aria-label="Open folder"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                >
                  <FiFolder className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void window.vault.system.openExternal(entry.sourceUrl)}
                  title="Open source playlist"
                  aria-label="Open source playlist"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                >
                  <FiExternalLink className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    const res = await window.vault.history.remove(entry.id);
                    if (res.ok) setEntries(res.data);
                  }}
                  title="Remove from history"
                  aria-label="Remove from history"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                >
                  <FiTrash2 className="h-4 w-4" />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
