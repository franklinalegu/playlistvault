import { useEffect, useState } from 'react';
import { FiDownloadCloud, FiExternalLink, FiShield } from 'react-icons/fi';
import type { AppInfo, UpdateState } from '@shared/types';
import { PageShell, ProgressBar } from '@/components/ui';

export function About(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    void window.vault.system.info().then((res) => {
      if (res.ok) setInfo(res.data);
    });
    return window.vault.updates.onState(setUpdate);
  }, []);

  return (
    <PageShell title="About" subtitle="Version information and credits.">
      <div className="space-y-5">
        <section className="glass flex items-center gap-5 p-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-sky-500 shadow-glow">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
              <path
                d="M12 3.5 20 7v6.2c0 4.2-3.3 7-8 8.3-4.7-1.3-8-4.1-8-8.3V7l8-3.5Z"
                stroke="white"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M9.6 9.8v5l4.6-2.5-4.6-2.5Z" fill="white" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">PlaylistVault</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Version {info?.version ?? '—'} · {info?.platform ?? ''}
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
              A local-first playlist archiver. Everything runs on your machine — no accounts, no
              telemetry, no cloud.
            </p>
            <p className="mt-2.5 text-xs text-slate-400">
              Built by <span className="font-medium text-slate-200">Franklin Alegu (FA)</span>
            </p>
          </div>
        </section>

        <section className="glass p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Updates</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-slate-300">{describeUpdate(update)}</p>
              {update.status === 'downloading' && (
                <ProgressBar value={update.percent ?? 0} className="mt-3 w-64" />
              )}
            </div>
            {update.status === 'ready' ? (
              <button onClick={() => void window.vault.updates.install()} className="btn-primary shrink-0">
                Restart & install
              </button>
            ) : (
              <button
                onClick={() => void window.vault.updates.check()}
                disabled={update.status === 'checking' || update.status === 'downloading'}
                className="btn-ghost shrink-0"
              >
                <FiDownloadCloud className="h-4 w-4" />
                Check now
              </button>
            )}
          </div>
        </section>

        <section className="glass p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Build details</h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-xs">
            <Row label="Electron" value={info?.electron} />
            <Row label="Chromium" value={info?.chrome} />
            <Row label="Node.js" value={info?.node} />
            <Row label="Platform" value={info?.platform} />
            {info?.binaries.map((b) => (
              <Row key={b.name} label={b.name} value={b.found ? b.version : 'Not found'} />
            ))}
          </dl>
          {info && (
            <button
              onClick={() => void window.vault.system.openPath(info.userDataPath)}
              className="mt-4 text-xs font-medium text-accent-300 hover:text-accent-200"
            >
              Open app data folder →
            </button>
          )}
        </section>

        <section className="glass border-amber-500/20 bg-amber-500/[0.06] p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <FiShield className="h-4 w-4" />
            Responsible use
          </h3>
          <p className="text-xs leading-relaxed text-amber-100/70">
            PlaylistVault is a tool for archiving content you own, content published under a licence
            that permits redistribution, or content you have explicit permission to save. Downloading
            copyrighted material without authorisation may breach YouTube's Terms of Service and the
            copyright law where you live. You are responsible for how you use this software.
          </p>
        </section>

        <section className="glass p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Built with</h3>
          <div className="flex flex-wrap gap-2">
            {[
              ['yt-dlp', 'https://github.com/yt-dlp/yt-dlp'],
              ['FFmpeg', 'https://ffmpeg.org'],
              ['Electron', 'https://electronjs.org'],
              ['React', 'https://react.dev'],
              ['Tailwind CSS', 'https://tailwindcss.com'],
              ['Framer Motion', 'https://motion.dev']
            ].map(([name, href]) => (
              <button
                key={name}
                onClick={() => void window.vault.system.openExternal(href)}
                className="chip glass-hover"
              >
                {name}
                <FiExternalLink className="h-3 w-3" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value?: string }): JSX.Element {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right font-mono text-slate-300" title={value}>
        {value ?? '—'}
      </dd>
    </>
  );
}

function describeUpdate(state: UpdateState): string {
  switch (state.status) {
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `Version ${state.version} is available and downloading.`;
    case 'downloading':
      return `Downloading update… ${state.percent ?? 0}%`;
    case 'ready':
      return `Version ${state.version} is ready to install.`;
    case 'up-to-date':
      return 'You are running the latest version.';
    case 'error':
      return state.message ?? 'Update check failed.';
    default:
      return state.message ?? 'No update checks have run yet.';
  }
}
