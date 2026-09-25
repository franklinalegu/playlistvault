import { Link } from 'react-router-dom';
import { FiDownload, FiMonitor } from 'react-icons/fi';

/**
 * Referral CTA pointing web users at the native app. `/download` resolves the
 * newest installer for the visitor's OS server-side, so one button fits all.
 */
export function GetDesktopApp({ compact = false }: { compact?: boolean }): JSX.Element {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a href="/download" className="btn-primary px-4 py-1.5 text-xs">
          <FiDownload className="h-3.5 w-3.5" />
          Get the desktop app
        </a>
        <Link to="/about" className="btn-ghost px-3 py-1.5 text-xs">
          All versions
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-white/[0.08] bg-gradient-to-r from-violet-500/[0.10] via-accent-500/[0.07] to-cyan-400/[0.08] p-5 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-cyan-400 shadow-glow">
          <FiMonitor className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-white">
            Archiving full playlists? Get the free desktop app
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            Parallel downloads, 4K, auto engine updates, offline library — same look, no browser limits.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a href="/download" className="btn-primary px-5">
          <FiDownload className="h-4 w-4" />
          Get the app
        </a>
        <Link to="/about" className="btn-ghost">
          All versions
        </Link>
      </div>
    </div>
  );
}
