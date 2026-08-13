import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FiAlertCircle, FiCheckSquare, FiSearch, FiSquare, FiUser, FiVideo } from 'react-icons/fi';
import type { PlaylistInfo } from '@shared/types';
import { formatBytes, formatDuration, formatLongDuration } from '@shared/format';
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
          <h2 className="truncate text-lg font-semibold tracking-tight text-white">
            {playlist.title}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
            <FiUser className="h-3.5 w-3.5" />
            {playlist.creator}
          </p>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <StatTile label="Videos" value={String(playlist.videoCount)} />
            <StatTile label="Duration" value={formatLongDuration(playlist.totalDurationSeconds)} />
            <StatTile label="Est. size" value={formatBytes(estimatedBytes)} hint="approximate" />
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

      <ul className="max-h-[320px] overflow-y-auto border-t border-white/[0.07]">
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
                  {video.title}
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
        {visible.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-slate-500">
            No videos match “{filter}”.
          </li>
        )}
      </ul>
    </motion.section>
  );
}
