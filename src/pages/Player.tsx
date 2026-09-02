import { useEffect, useMemo, useState } from 'react';
import { FiClock, FiFolder, FiPlay, FiSearch, FiFilm, FiExternalLink } from 'react-icons/fi';
import type { LocalVideo } from '@shared/types';
import { formatBytes } from '@shared/format';
import { PageShell, EmptyState } from '@/components/ui';
import { VideoPlayer } from '@/components/VideoPlayer';

export function Player(): JSX.Element {
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    setLoading(true);
    const res = await window.vault.media.list();
    if (res.ok) setVideos(res.data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter(v => v.title.toLowerCase().includes(q) || v.playlistTitle?.toLowerCase().includes(q) || v.filePath.toLowerCase().includes(q));
  }, [videos, query]);

  const activeIdx = filtered.findIndex(v => v.id === activeId);
  const active = activeIdx >= 0 ? filtered[activeIdx] : null;

  const next = (): void => {
    if (activeIdx < 0 || activeIdx >= filtered.length - 1) return;
    setActiveId(filtered[activeIdx + 1].id);
  };
  const prev = (): void => {
    if (activeIdx <= 0) return;
    setActiveId(filtered[activeIdx - 1].id);
  };

  return (
    <PageShell
      title="Player"
      subtitle="Play downloaded videos right here — offline, without opening YouTube or Udemy. Uses the same files you already saved."
      actions={
        <button onClick={() => void load()} className="btn-ghost text-xs">Refresh</button>
      }
    >
      {active && (
        <div className="mb-6">
          <VideoPlayer
            src={active.fileUrl}
            title={active.title}
            hasNext={activeIdx < filtered.length - 1}
            hasPrev={activeIdx > 0}
            onNext={next}
            onPrev={prev}
            onEnded={next}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="truncate">{active.playlistTitle ?? ''}</span>
            <span>·</span>
            <span>{formatBytes(active.sizeBytes)}</span>
            <span>·</span>
            <span>{new Date(active.modifiedAt).toLocaleString()}</span>
            <button onClick={() => void window.vault.media.reveal(active.filePath)} className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs hover:bg-white/10">
              <FiFolder className="h-3 w-3" /> Show in folder
            </button>
            {active.sourceUrl && (
              <button onClick={() => void window.vault.system.openExternal(active.sourceUrl!)} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs hover:bg-white/10">
                <FiExternalLink className="h-3 w-3" /> Source
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your offline library…" aria-label="Search videos" className="input pl-10" />
        </div>
        <span className="hidden sm:inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-slate-400">
          <FiFilm className="mr-1.5 h-3.5 w-3.5" /> {filtered.length} videos
        </span>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FiFilm />}
          title={videos.length === 0 ? 'No videos saved yet' : 'No matches'}
          description={videos.length === 0 ? 'Download a playlist from Home — then play it here offline, no browser needed.' : 'Try a different search term.'}
          action={<button onClick={() => void load()} className="btn-primary">Re-scan</button>}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(v => (
            <button
              key={v.id}
              onClick={() => setActiveId(v.id)}
              className={`group flex flex-col overflow-hidden rounded-2xl border text-left transition ${activeId === v.id ? 'border-violet-400/50 bg-violet-500/10 shadow-glow' : 'border-white/[0.07] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]'}`}
            >
              <div className="relative aspect-video overflow-hidden bg-black">
                {/* Use thumbnail if available later; fallback to play overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-violet-500/20 via-transparent to-cyan-400/15">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition ${activeId === v.id ? 'bg-white text-slate-900' : 'bg-white/90 text-slate-900 group-hover:bg-white'}`}>
                    <FiPlay className="ml-0.5 h-5 w-5" />
                  </span>
                </div>
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">{v.container.toUpperCase()}</span>
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">{v.title}</p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-400">
                  {v.playlistTitle && <><span className="truncate">{v.playlistTitle}</span><span>·</span></>}
                  <span className="inline-flex items-center gap-1"><FiClock className="h-3 w-3" />{formatBytes(v.sizeBytes)}</span>
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </PageShell>
  );
}
