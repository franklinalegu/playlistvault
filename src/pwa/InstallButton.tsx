import { useState } from 'react';
import { FiDownload, FiCheck, FiShare } from 'react-icons/fi';
import { usePwaInstall } from './usePwaInstall';

/**
 * "Install app" control. Shown in the sidebar and on the web landing hero.
 * - Chromium/Edge: triggers the native install prompt.
 * - iOS Safari: shows Share → Add to Home Screen guidance.
 * - Already installed / desktop Electron: renders nothing.
 */
export function InstallButton({ compact = false }: { compact?: boolean }): JSX.Element | null {
  const { canInstall, installed, isIos, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  // Running inside Electron — the native installer story already covers this.
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') return null;
  if (installed && !isIos) return null;

  if (isIos && !installed) {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setIosHint((v) => !v)}
          className={compact ? 'btn-ghost w-full px-3 py-1 text-xs' : 'btn-ghost w-full'}
        >
          <FiShare className="h-4 w-4" /> Install app
        </button>
        {iosHint && (
          <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-[11px] leading-relaxed text-slate-300">
            Tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong> to install PlaylistVault.
          </p>
        )}
      </div>
    );
  }

  if (!canInstall) return null;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void promptInstall().finally(() => setBusy(false));
      }}
      className={compact ? 'btn-ghost w-full px-3 py-1 text-xs' : 'btn-primary w-full'}
      title="Install PlaylistVault as an app"
    >
      {busy ? <FiCheck className="h-4 w-4" /> : <FiDownload className="h-4 w-4" />}
      {busy ? 'Installing…' : 'Install app'}
    </button>
  );
}
