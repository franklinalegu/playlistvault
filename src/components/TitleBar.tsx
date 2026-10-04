import { useLocation } from 'react-router-dom';
import { FiActivity, FiChevronRight, FiDownloadCloud, FiMenu, FiSearch } from 'react-icons/fi';
import { useQueue } from '@/contexts/QueueContext';
import { formatSpeed } from '@shared/format';
import { isStandalonePwa, isWebBuild } from '@/web/detect';

const TITLES: Record<string, { title: string; section: string; desc: string }> = {
  '/': { title: 'Home', section: 'Workspace', desc: 'Analyze & queue' },
  '/downloads': { title: 'Queue', section: 'Downloads', desc: 'Jobs & progress' },
  '/history': { title: 'Library', section: 'History', desc: 'Past saves' },
  '/settings': { title: 'Settings', section: 'Preferences', desc: 'App & engine' },
  '/about': { title: 'About', section: 'PlaylistVault', desc: 'v6 · Neo' }
};

export function TitleBar({ onMenu }: { onMenu?: () => void }): JSX.Element {
  const { pathname } = useLocation();
  const { jobs } = useQueue();

  const totalSpeed = jobs
    .filter((j) => j.status === 'downloading')
    .flatMap((j) => j.items)
    .filter((i) => i.status === 'downloading')
    .reduce((sum, i) => sum + i.speedBytesPerSecond, 0);

  const meta = TITLES[pathname] ?? { title: 'PlaylistVault', section: 'v6', desc: 'Neo' };

  return (
    <header className="drag-region relative flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] bg-vault-950/70 px-4 sm:px-6 backdrop-blur-2xl">
      <div className="flex min-w-0 items-center gap-3">
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label="Open navigation"
            className="no-drag shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <FiMenu className="h-5 w-5" />
          </button>
        )}
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-3 pr-2.5 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 shadow-[0_0_8px_rgba(99,102,241,0.9)]" />
          <FiActivity className="h-3 w-3 text-violet-300" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">{meta.section}</span>
        </div>
        <FiChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-slate-600 md:block" aria-hidden="true" />
        <div className="min-w-0 leading-none">
          <h1 className="flex items-center gap-2 font-display text-[15px] font-bold tracking-tight text-white">
            <span className="truncate">{meta.title}</span>
            {isWebBuild() && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-[3px] text-[9px] font-extrabold tracking-[0.14em] text-cyan-200"
                title={isStandalonePwa() ? 'Installed web app' : 'Web version — no install needed'}
              >
                <span className="h-1 w-1 rounded-full bg-cyan-300" />
                {isStandalonePwa() ? 'APP' : 'WEB'}
              </span>
            )}
          </h1>
          <p className="mt-1 truncate text-[12px] font-medium text-slate-400">{meta.desc}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Search hint - v6 command palette affordance */}
        <div className="hidden items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pl-3 pr-2 text-xs text-slate-400 lg:flex">
          <FiSearch className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-medium">Paste a link to start</span>
          <kbd className="rounded-md border border-white/10 bg-white/[0.07] px-1.5 py-0.5 font-sans text-[10px] font-bold text-slate-300">↵</kbd>
        </div>

        {totalSpeed > 0 && (
          <div className="no-drag flex items-center gap-2 rounded-full border border-cyan-400/25 bg-gradient-to-r from-violet-500/15 to-cyan-400/15 py-2 pl-3 pr-3.5 shadow-inner">
            <FiDownloadCloud className="h-3.5 w-3.5 animate-pulse-soft text-cyan-300" />
            <span className="text-xs font-extrabold tabular-nums text-cyan-100">
              {formatSpeed(totalSpeed)}
            </span>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-cyan-400/30" />
    </header>
  );
}
