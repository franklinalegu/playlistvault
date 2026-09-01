import { useEffect, useState } from 'react';
import { FiDownloadCloud, FiExternalLink, FiX } from 'react-icons/fi';
import type { UpdateState } from '@shared/types';

export function AppUpdateBanner(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => window.vault.updates.onState(setState), []);

  // Only show for actionable states; About page handles its own details.
  const visible =
    (state.status === 'available' || state.status === 'downloading' || state.status === 'ready') &&
    state.version !== dismissedVersion;

  if (!visible) return null;

  const changelogUrl = 'https://github.com/franklinalegu/playlistvault/releases';

  return (
    <div className="sticky top-0 z-40 border-b border-white/[0.07] bg-vault-900/95 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[960px] items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/20 text-accent-300">
          <FiDownloadCloud className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            {state.status === 'ready'
              ? `Version ${state.version} is ready to install`
              : state.status === 'downloading'
                ? `Downloading update ${state.version} — ${state.percent ?? 0}%`
                : `Version ${state.version} is available`}
          </p>
          <p className="truncate text-xs text-slate-400">
            {state.status === 'ready'
              ? 'Restart to apply YouTube & stability fixes. See what’s new in the release notes.'
              : 'Includes fix for “exit code 4294967295”, HTTP 403 / bot detection, Chrome cookie lock, and proxy auth.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => void window.vault.system.openExternal(changelogUrl)}
            className="btn-ghost hidden px-3 py-1 text-xs sm:inline-flex"
            title="View release notes on GitHub"
          >
            <FiExternalLink className="h-3 w-3" /> What’s fixed
          </button>
          {state.status === 'ready' ? (
            <button onClick={() => void window.vault.updates.install()} className="btn-primary px-4 py-1.5 text-xs">
              Restart & install
            </button>
          ) : state.status === 'downloading' ? (
            <span className="px-3 py-1 text-xs text-slate-400">Downloading…</span>
          ) : (
            <button
              onClick={() => void window.vault.updates.check()}
              className="btn-primary px-4 py-1.5 text-xs"
              disabled={state.status === 'checking'}
            >
              Download
            </button>
          )}
          <button
            onClick={() => setDismissedVersion(state.version ?? 'dismissed')}
            aria-label="Dismiss"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>
      </div>
      {state.status === 'downloading' && (
        <div className="mx-auto mt-2 h-1 max-w-[960px] overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent-500 transition-all" style={{ width: `${state.percent ?? 0}%` }} />
        </div>
      )}
    </div>
  );
}
