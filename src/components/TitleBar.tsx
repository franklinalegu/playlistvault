import { useLocation } from 'react-router-dom';
import { FiDownloadCloud } from 'react-icons/fi';
import { useQueue } from '@/contexts/QueueContext';
import { formatSpeed } from '@shared/format';

const TITLES: Record<string, { title: string; section: string }> = {
  '/': { title: 'Home', section: 'Start' },
  '/downloads': { title: 'Downloads', section: 'Queue' },
  '/history': { title: 'History', section: 'Library' },
  '/settings': { title: 'Settings', section: 'Preferences' },
  '/about': { title: 'About', section: 'Info' }
};

export function TitleBar(): JSX.Element {
  const { pathname } = useLocation();
  const { jobs } = useQueue();

  const totalSpeed = jobs
    .filter((j) => j.status === 'downloading')
    .flatMap((j) => j.items)
    .filter((i) => i.status === 'downloading')
    .reduce((sum, i) => sum + i.speedBytesPerSecond, 0);

  const meta = TITLES[pathname] ?? { title: 'PlaylistVault', section: '' };

  return (
    <header className="drag-region relative flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] bg-vault-950/40 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        {meta.section && (
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 sm:block">
            {meta.section}
            <span className="mx-2 text-slate-700">/</span>
          </span>
        )}
        <p className="text-xs font-semibold tracking-wide text-slate-300">{meta.title}</p>
      </div>

      {totalSpeed > 0 && (
        <div className="no-drag mr-32 flex items-center gap-2.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-1 shadow-inner">
          <FiDownloadCloud className="h-3.5 w-3.5 animate-pulse-soft text-accent-300" />
          <span className="text-[11px] font-semibold tabular-nums text-accent-100">
            {formatSpeed(totalSpeed)}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
    </header>
  );
}
