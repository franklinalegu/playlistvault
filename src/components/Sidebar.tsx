import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiClock, FiDownload, FiHome, FiInfo, FiPlayCircle, FiSettings, FiZap } from 'react-icons/fi';
import { useQueue } from '@/contexts/QueueContext';
import { formatSpeed } from '@shared/format';

const LINKS = [
  { to: '/', label: 'Home', icon: FiHome, end: true, desc: 'Analyze' },
  { to: '/downloads', label: 'Queue', icon: FiDownload, end: false, desc: 'Active jobs' },
  { to: '/player', label: 'Player', icon: FiPlayCircle, end: false, desc: 'Watch offline' },
  { to: '/history', label: 'Library', icon: FiClock, end: false, desc: 'Past saves' },
  { to: '/settings', label: 'Settings', icon: FiSettings, end: false, desc: 'Preferences' },
  { to: '/about', label: 'About', icon: FiInfo, end: false, desc: 'v6 · Neo' }
];

export function Sidebar(): JSX.Element {
  const { jobs } = useQueue();

  const activeJobs = jobs.filter(
    (j) => j.status === 'downloading' || j.status === 'queued' || j.status === 'converting'
  ).length;
  const downloading = jobs.filter((j) => j.status === 'downloading');
  const totalSpeed = downloading
    .flatMap((j) => j.items)
    .filter((i) => i.status === 'downloading')
    .reduce((sum, i) => sum + i.speedBytesPerSecond, 0);

  return (
    <aside className="relative flex w-[268px] shrink-0 flex-col border-r border-white/[0.08] bg-vault-900/55 px-3.5 pb-4 pt-4 backdrop-blur-2xl">
      {/* Brand — v6 */}
      <div className="mb-6 flex items-center gap-3 px-1.5 pt-1">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-accent-500 to-cyan-400 shadow-v6-glow">
          <VaultMark />
          <span className="absolute -right-1 -top-1 flex h-5 items-center rounded-full border-2 border-vault-950 bg-gradient-to-r from-accent-500 to-cyan-400 px-1.5 text-[9px] font-black tracking-wider text-white">
            6
          </span>
        </div>
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-1.5 text-[14.5px] font-bold tracking-tight text-white">
            PlaylistVault
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest text-accent-200">V6</span>
          </p>
          <p className="text-[11px] font-medium tracking-wide text-slate-400">Neo · offline-first</p>
        </div>
      </div>

      {/* Whats new pill */}
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/15 via-accent-500/12 to-cyan-400/10 px-3 py-2.5">
        <FiZap className="h-3.5 w-3.5 shrink-0 text-violet-300" />
        <p className="text-[11px] font-medium leading-tight text-violet-100">
          <span className="font-bold">New in v6</span> — Auto yt-dlp + Neo layout
        </p>
      </div>

      {/* Navigation */}
      <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        Navigate
      </p>
      <nav className="flex flex-col gap-1">
        {LINKS.map(({ to, label, icon: Icon, end, desc }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-link no-drag group ${isActive ? 'nav-link-active bg-white/[0.09] text-white shadow-inner border border-white/[0.06]' : 'border border-transparent hover:border-white/[0.06]'}`}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-indicator-v6"
                    className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-violet-400 via-accent-400 to-cyan-400 shadow-[0_0_14px_rgba(99,102,241,0.8)]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${isActive ? 'bg-gradient-to-br from-accent-500/30 to-cyan-400/20 text-accent-200 border border-accent-400/20' : 'bg-white/[0.04] text-slate-400 group-hover:text-slate-200 group-hover:bg-white/[0.08]'}`}>
                  <Icon className="h-[16px] w-[16px]" />
                </span>
                <span className="flex-1 leading-none">
                  <span className="block text-[13px] font-semibold tracking-tight">{label}</span>
                  <span className={`block text-[10px] font-medium ${isActive ? 'text-slate-300' : 'text-slate-500 group-hover:text-slate-400'}`}>{desc}</span>
                </span>
                {label === 'Queue' && activeJobs > 0 && (
                  <span className="rounded-full bg-gradient-to-r from-accent-500 to-cyan-400 px-2 py-0.5 text-[11px] font-black text-white shadow">
                    {activeJobs}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Live status — elevated card */}
      <div className="mt-auto space-y-3">
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-3.5 shadow-glass backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Live engine
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
              v6 Neo
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xs font-medium text-slate-400">
              {activeJobs === 0 ? 'Idle' : `${activeJobs} active`}
            </span>
            {totalSpeed > 0 ? (
              <span className="text-xs font-bold tabular-nums text-cyan-200">
                {formatSpeed(totalSpeed)}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-500">yt-dlp auto</span>
            )}
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-black/30 p-[2px]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-accent-500 to-cyan-400"
              initial={false}
              animate={{ width: totalSpeed > 0 ? '100%' : `${activeJobs > 0 ? 42 : 0}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <p className="mt-2.5 text-[10px] leading-relaxed text-slate-500">
            Auto yt-dlp updates every 12h. No manual upkeep.
          </p>
        </div>

        <p className="px-1 text-[10px] leading-relaxed text-slate-600">
          v6 redesigned for speed. Only save content you have rights to.
        </p>
      </div>
    </aside>
  );
}

function VaultMark(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" aria-hidden="true">
      <path
        d="M12 3.2 20 6.8v6.4c0 4.35-3.35 7.2-8 8.55-4.65-1.35-8-4.2-8-8.55V6.8l8-3.6Z"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.4 10.2v4.8l4.9-2.4-4.9-2.4Z" fill="white" />
    </svg>
  );
}
