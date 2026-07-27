import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiClock,
  FiDownload,
  FiHome,
  FiInfo,
  FiSettings
} from 'react-icons/fi';
import { useQueue } from '@/contexts/QueueContext';

const LINKS = [
  { to: '/', label: 'Home', icon: FiHome, end: true },
  { to: '/downloads', label: 'Downloads', icon: FiDownload, end: false },
  { to: '/history', label: 'History', icon: FiClock, end: false },
  { to: '/settings', label: 'Settings', icon: FiSettings, end: false },
  { to: '/about', label: 'About', icon: FiInfo, end: false }
];

export function Sidebar(): JSX.Element {
  const { activeCount } = useQueue();

  return (
    <aside className="flex w-[228px] shrink-0 flex-col gap-2 border-r border-white/[0.07] bg-white/[0.02] px-3 pb-4 pt-3 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-3 px-2 pt-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-sky-500 shadow-glow">
          <VaultMark />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-white">PlaylistVault</p>
          <p className="text-[11px] text-slate-500">Offline library</p>
        </div>
      </div>

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
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1">{label}</span>
                {label === 'Downloads' && activeCount > 0 && (
                  <span className="rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-200">
                    {activeCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-2">
        <p className="text-[10px] leading-relaxed text-slate-600">
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
