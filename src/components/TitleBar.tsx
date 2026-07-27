import { useLocation } from 'react-router-dom';
import { FiDownloadCloud } from 'react-icons/fi';
import { useQueue } from '@/contexts/QueueContext';
import { formatSpeed } from '@shared/format';

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/downloads': 'Downloads',
  '/history': 'History',
  '/settings': 'Settings',
  '/about': 'About'
};

export function TitleBar(): JSX.Element {
  const { pathname } = useLocation();
  const { jobs } = useQueue();

  const totalSpeed = jobs
    .filter((j) => j.status === 'downloading')
    .flatMap((j) => j.items)
    .filter((i) => i.status === 'downloading')
    .reduce((sum, i) => sum + i.speedBytesPerSecond, 0);

  return (
    <header className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
      <p className="text-xs font-medium tracking-wide text-slate-400">
        {TITLES[pathname] ?? 'PlaylistVault'}
      </p>

      {totalSpeed > 0 && (
        <div className="no-drag mr-32 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1">
          <FiDownloadCloud className="h-3.5 w-3.5 animate-pulse text-accent-300" />
          <span className="text-[11px] font-semibold tabular-nums text-slate-300">
            {formatSpeed(totalSpeed)}
          </span>
        </div>
      )}
    </header>
  );
}
