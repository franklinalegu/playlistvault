import { useLocation } from 'react-router-dom';
import { FiActivity, FiDownloadCloud, FiSearch } from 'react-icons/fi';
import { useQueue } from '@/contexts/QueueContext';
import { formatSpeed } from '@shared/format';

const TITLES: Record<string, { title: string; section: string; desc: string }> = {
  '/': { title: 'Home', section: 'Workspace', desc: 'Analyze & queue' },
  '/downloads': { title: 'Queue', section: 'Downloads', desc: 'Jobs & progress' },
  '/history': { title: 'Library', section: 'History', desc: 'Past saves' },
  '/settings': { title: 'Settings', section: 'Preferences', desc: 'App & engine' },
  '/about': { title: 'About', section: 'PlaylistVault', desc: 'v6 · Neo' }
};

export function TitleBar(): JSX.Element {
  const { pathname } = useLocation();
  const { jobs } = useQueue();

  const totalSpeed = jobs
    .filter((j) => j.status === 'downloading')
    .flatMap((j) => j.items)
    .filter((i) => i.status === 'downloading')
    .reduce((sum, i) => sum + i.speedBytesPerSecond, 0);

  const meta = TITLES[pathname] ?? { title: 'PlaylistVault', section: 'v6', desc: 'Neo' };

  return (
    <header className="drag-region relative flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] bg-vault-950/55 px-5 backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
          <FiActivity className="h-3 w-3 text-violet-300" />
          <span className="text-[11px] font-bold tracking-widest text-slate-300">{meta.section}</span>
        </div>
        <div className="hidden sm:block h-4 w-px bg-white/10" />
        <div>
          <p className="text-[13px] font-bold tracking-tight text-white leading-none">{meta.title}</p>
          <p className="text-[11px] font-medium text-slate-500 leading-none mt-0.5">{meta.desc}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search hint - v6 command palette affordance */}
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-500">
          <FiSearch className="h-3.5 w-3.5" />
          <span className="font-medium">Paste a link to start</span>
          <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-300">↵</span>
        </div>

        {totalSpeed > 0 && (
          <div className="no-drag flex items-center gap-2.5 rounded-full border border-cyan-400/25 bg-gradient-to-r from-violet-500/15 to-cyan-400/15 px-3.5 py-1.5 shadow-inner">
            <FiDownloadCloud className="h-3.5 w-3.5 animate-pulse-soft text-cyan-300" />
            <span className="text-xs font-black tabular-nums text-cyan-100">
              {formatSpeed(totalSpeed)}
            </span>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-cyan-400/30" />
    </header>
  );
}
