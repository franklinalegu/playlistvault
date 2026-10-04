import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FiAlertCircle, FiCheckSquare, FiSearch, FiSquare, FiUser, FiVideo } from 'react-icons/fi';
import type { PlaylistInfo } from '@shared/types';
import { formatBytes, formatDuration, formatLongDuration, toDisplayTitle } from '@shared/format';
import { StatTile } from './ui';

export function PlaylistPanel({
  playlist,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  estimatedBytes
}: {
  playlist: PlaylistInfo;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  estimatedBytes: number;
}): JSX.Element {
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return playlist.videos;
    return playlist.videos.filter((v) => v.title.toLowerCase().includes(q));
  }, [filter, playlist.videos]);

  const unavailable = playlist.videos.filter((v) => !v.isAvailable).length;

  const isChannel = (playlist as { kind?: string }).kind === 'channel';
  const groups = useMemo(() => {
    if (!isChannel) return null;
    const map = new Map<string, { videos: typeof playlist.videos; section?: string }>();
    for (const v of visible) {
      const key = v.playlistTitle?.trim() || v.uploader?.trim() || 'Uploads';
      if (!map.has(key)) map.set(key, { videos: [], section: v.section });
      const g = map.get(key)!;
      g.videos.push(v);
      if (!g.section && v.section) g.section = v.section;
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [isChannel, visible]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="glass overflow-hidden"
    >
      <div className="flex gap-5 p-5">
        <div className="relative h-[104px] w-[186px] shrink-0 overflow-hidden rounded-xl bg-vault-800 shadow-glass-sm">
          {playlist.thumbnail ? (
            <img
              src={playlist.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-600">
              <FiVideo className="h-7 w-7" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-vault-950/50 via-transparent to-transparent" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-white">
              {toDisplayTitle(playlist.title)}
            </h2>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                playlist.platform === 'udemy'
                  ? 'bg-violet-500/15 text-violet-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {playlist.platform}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
            <FiUser className="h-3.5 w-3.5" />
            {playlist.creator}
            {isChannel && (
              <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300">
                channel archive · saves into playlist subfolders
              </span>
            )}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Videos" value={String(playlist.videoCount)} />
            <StatTile
              label="Duration"
              value={
                playlist.totalDurationSeconds > 0
                  ? formatLongDuration(playlist.totalDurationSeconds)
                  : '—'
              }
            />
            <StatTile
              label="Est. size"
              value={estimatedBytes > 0 ? formatBytes(estimatedBytes) : '—'}
              hint="approximate"
            />
            <StatTile label="Selected" value={String(selected.size)} />
          </div>
        </div>
      </div>

      {unavailable > 0 && (
        <div className="mx-5 mb-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5">
          <FiAlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200/90">
            {unavailable} video{unavailable > 1 ? 's are' : ' is'} private, deleted or otherwise
            unavailable and cannot be selected.
          </p>
        </div>
      )}

      {(playlist.duplicateCount ?? 0) > 0 && (
        <div className="mx-5 mb-4 flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3.5 py-2.5">
          <FiCheckSquare className="h-4 w-4 shrink-0 text-cyan-400" />
          <p className="text-xs text-cyan-200/90">
            {playlist.duplicateCount} repeated video{playlist.duplicateCount! > 1 ? 's' : ''} found across
            uploads, courses and podcasts — kept once, so nothing downloads twice.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-white/[0.07] px-5 py-3">
        <div className="relative flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter videos…"
            aria-label="Filter videos"
            className="input py-2 pl-9 text-xs"
          />
        </div>
        <button onClick={onSelectAll} className="btn-ghost px-3 py-2 text-xs">
          Select all
        </button>
        <button onClick={onSelectNone} className="btn-ghost px-3 py-2 text-xs">
          Clear
        </button>
      </div>

      <div className="max-h-[320px] overflow-y-auto border-t border-white/[0.07]">
        {groups ? (
          groups.map(([name, group]) => {
            const items = group.videos;
            const sectionLabel =
              group.section === 'course' ? 'Course'
              : group.section === 'podcast' ? 'Podcast'
              : group.section === 'playlist' ? 'Playlist'
              : group.section === 'uploads' ? 'Uploads'
              : null;
            return (
            <div key={name}>
              <div className="sticky top-0 flex items-center justify-between gap-2 bg-vault-900/95 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur">
                <span className="truncate">{toDisplayTitle(name)}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {sectionLabel && (
                    <span className="rounded-full bg-white/[0.07] px-1.5 py-px text-[9px] font-bold normal-case tracking-wide text-slate-300">
                      {sectionLabel}
                    </span>
                  )}
                  <span className="tabular-nums">{items.length}</span>
                </span>
              </div>
              <ul>
                {items.map((video) => {
                  const isSelected = selected.has(video.id);
                  return (
                    <li key={video.id}>
                      <button
                        type="button"
                        disabled={!video.isAvailable}
                        onClick={() => onToggle(video.id)}
                        className={`flex w-full items-center gap-3 border-b border-white/[0.04] px-5 py-2.5 text-left transition-colors last:border-0 ${
                          video.isAvailable ? 'hover:bg-white/[0.04]' : 'cursor-not-allowed opacity-40'
                        }`}
                      >
                        {isSelected ? (
                          <FiCheckSquare className="h-4 w-4 shrink-0 text-accent-300" />
                        ) : (
                          <FiSquare className="h-4 w-4 shrink-0 text-slate-600" />
                        )}
                        <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-slate-600">
                          {video.index}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                          {toDisplayTitle(video.title)}
                        </span>
                        {video.unavailableReason ? (
                          <span className="shrink-0 text-[11px] text-amber-400/80">
                            {video.unavailableReason}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                            {formatDuration(video.durationSeconds)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })
        ) : (
          <ul>
            {visible.map((video) => {
              const isSelected = selected.has(video.id);
              return (
                <li key={video.id}>
                  <button
                    type="button"
                    disabled={!video.isAvailable}
                    onClick={() => onToggle(video.id)}
                    className={`flex w-full items-center gap-3 border-b border-white/[0.04] px-5 py-2.5 text-left transition-colors last:border-0 ${
                      video.isAvailable ? 'hover:bg-white/[0.04]' : 'cursor-not-allowed opacity-40'
                    }`}
                  >
                    {isSelected ? (
                      <FiCheckSquare className="h-4 w-4 shrink-0 text-accent-300" />
                    ) : (
                      <FiSquare className="h-4 w-4 shrink-0 text-slate-600" />
                    )}
                    <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-slate-600">
                      {video.index}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                      {toDisplayTitle(video.title)}
                    </span>
                    {video.unavailableReason ? (
                      <span className="shrink-0 text-[11px] text-amber-400/80">
                        {video.unavailableReason}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                        {formatDuration(video.durationSeconds)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {visible.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No videos match “{filter}”.
          </p>
        )}
      </div>
    </motion.section>
  );
}
