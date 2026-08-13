import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiClock, FiDownload, FiHome, FiInfo, FiSettings } from 'react-icons/fi';
import { useQueue } from '@/contexts/QueueContext';
import { formatSpeed } from '@shared/format';

const LINKS = [
  { to: '/', label: 'Home', icon: FiHome, end: true },
  { to: '/downloads', label: 'Downloads', icon: FiDownload, end: false },
  { to: '/history', label: 'History', icon: FiClock, end: false },
  { to: '/settings', label: 'Settings', icon: FiSettings, end: false },
  { to: '/about', label: 'About', icon: FiInfo, end: false }
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
  const activeCount = activeJobs;

  return (
    <aside className="relative flex w-[232px] shrink-0 flex-col border-r border-white/[0.07] bg-vault-900/40 px-3 pb-4 pt-3 backdrop-blur-2xl">
      {/* Brand */}
      <div className="mb-7 flex items-center gap-3 px-2 pt-1">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-sky-500 shadow-glow">
          <VaultMark />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-vault-950 bg-emerald-400" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold tracking-tight text-white">PlaylistVault</p>
          <p className="text-[11px] text-slate-500">v3 · offline library</p>
        </div>
      </div>

      {/* Navigation */}
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        Menu
      </p>
      <nav className="flex flex-col gap-1">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-link no-drag ${isActive ? 'nav-link-active' : ''}`}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-accent-400 to-sky-400 shadow-[0_0_12px_rgba(79,70,229,0.7)]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                    isActive ? 'text-accent-300' : ''
                  }`}
                />
                <span className="flex-1">{label}</span>
                {label === 'Downloads' && activeCount > 0 && (
                  <span className="rounded-md bg-accent/25 px-1.5 py-0.5 text-[10px] font-bold text-accent-200">
                    {activeCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Live status footer */}
      <div className="mt-auto">
        <div className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Active
            </span>
            {totalSpeed > 0 ? (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-accent-200">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent-400" />
                {formatSpeed(totalSpeed)}
              </span>
            ) : (
              <span className="text-[11px] tabular-nums text-slate-500">
                {activeCount} queued
              </span>
            )}
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent-500 to-sky-400"
              initial={false}
              animate={{ width: totalSpeed > 0 ? '100%' : `${activeCount > 0 ? 35 : 0}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>

        <p className="px-2 text-[10px] leading-relaxed text-slate-600">
          Only download content you own or have permission to save.
        </p>
      </div>
    </aside>
  );
}

function VaultMark(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 20 7v6.2c0 4.2-3.3 7-8 8.3-4.7-1.3-8-4.1-8-8.3V7l8-3.5Z"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9.6 9.8v5l4.6-2.5-4.6-2.5Z" fill="white" />
    </svg>
  );
}
