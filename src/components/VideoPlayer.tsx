import { useEffect, useRef, useState } from 'react';
import { FiMaximize, FiPause, FiPlay, FiSkipBack, FiSkipForward, FiVolume2, FiVolumeX } from 'react-icons/fi';

interface Props {
  src: string;
  title: string;
  poster?: string;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  onEnded?: () => void;
}

export function VideoPlayer({ src, title, poster, onNext, onPrev, hasNext, hasPrev, onEnded }: Props): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = (): void => setTime(v.currentTime);
    const onDur = (): void => setDuration(v.duration || 0);
    const onPlay = (): void => setPlaying(true);
    const onPause = (): void => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', () => onEnded?.());
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onDur);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [src, onEnded]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = volume;
      ref.current.muted = muted;
    }
  }, [volume, muted]);

  // Auto-play when src changes
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.load();
    const p = v.play();
    if (p?.catch) p.catch(() => setPlaying(false));
  }, [src]);

  const pct = duration ? (time / duration) * 100 : 0;

  const toggle = (): void => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play(); else v.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>): void => {
    const v = ref.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const next = (x / rect.width) * duration;
    v.currentTime = next;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black shadow-glass">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.04] px-4 py-2.5">
        <p className="min-w-0 truncate text-sm font-semibold text-white">{title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => onPrev?.()} disabled={!hasPrev} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"><FiSkipBack className="h-4 w-4" /></button>
          <button onClick={() => onNext?.()} disabled={!hasNext} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"><FiSkipForward className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="relative bg-black">
        <video
          ref={ref}
          src={src}
          poster={poster}
          className="h-[360px] w-full object-contain sm:h-[420px] lg:h-[480px]"
          playsInline
          preload="metadata"
          onClick={toggle}
        />
        {/* Center play overlay when paused */}
        {!playing && (
          <button onClick={toggle} className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-xl"><FiPlay className="ml-1 h-7 w-7" /></span>
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gradient-to-b from-white/[0.04] to-black/20 px-3 py-3">
        <div className="mb-3 h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/15 p-[2px]" onClick={seek}>
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-accent-500 to-cyan-400" style={{ width: `${pct}%` }} />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggle} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-900 hover:bg-slate-100">
            {playing ? <FiPause className="h-4 w-4" /> : <FiPlay className="ml-0.5 h-4 w-4" />}
          </button>

          <button onClick={() => setMuted(m => !m)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            {muted || volume === 0 ? <FiVolumeX className="h-4 w-4" /> : <FiVolume2 className="h-4 w-4" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={e => { const v = Number(e.target.value); setVolume(v); setMuted(v === 0); }} className="w-24 accent-accent sm:w-28" aria-label="Volume" />

          <span className="ml-1 hidden sm:inline text-xs tabular-nums text-slate-400">{formatTime(time)} / {formatTime(duration)}</span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => ref.current?.requestFullscreen?.().catch(() => undefined)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              title="Fullscreen"
            >
              <FiMaximize className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${(m % 60).toString().padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
}
