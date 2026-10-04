import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiActivity,
  FiCheck,
  FiCheckCircle,
  FiCopy,
  FiDownloadCloud,
  FiExternalLink,
  FiFileText,
  FiFolder,
  FiRefreshCw,
  FiShield,
  FiXCircle
} from 'react-icons/fi';
import type { AppInfo, BinaryStatus, UpdateState } from '@shared/types';
import { useToast } from '@/contexts/ToastContext';
import { PageShell, ProgressBar } from '@/components/ui';
import { InstallButton } from '@/pwa/InstallButton';
import { DesktopDownloads } from '@/components/DesktopDownloads';
import { isStandalonePwa, isWebBuild } from '@/web/detect';

const REPO = 'franklinalegu/playlistvault';

export function About(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });
  const [bins, setBins] = useState<BinaryStatus[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    void window.vault.system.info().then((res) => {
      if (res.ok) setInfo(res.data);
    });
    void window.vault.system.checkBinaries().then((res) => {
      if (res.ok) setBins(res.data);
    });
    return window.vault.updates.onState(setUpdate);
  }, []);

  // Pull the published release notes so an available update shows its
  // changelog inline. Fails silently offline — the GitHub link remains.
  useEffect(() => {
    if (update.status !== 'available' && update.status !== 'ready' && update.status !== 'downloading') {
      return;
    }
    const tag = update.version ? `v${update.version}` : 'latest';
    let cancelled = false;
    void fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.body) setNotes(String(j.body).slice(0, 2000));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [update.status, update.version]);

  const diagnostics = useMemo(() => {
    const lines = [
      `PlaylistVault ${info?.version ?? '?'}`,
      `Platform: ${info?.platform ?? '?'} · Electron ${info?.electron ?? '?'} · Chromium ${info?.chrome ?? '?'} · Node ${info?.node ?? '?'}`,
      ...(bins ?? []).map((b) => `${b.name}: ${b.found ? b.version ?? 'found' : 'NOT FOUND'}`),
      `Update: ${update.status}${update.version ? ` (${update.version})` : ''}`
    ];
    return lines.join('\n');
  }, [info, bins, update]);

  const copyDiagnostics = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
      success('Copied', 'Diagnostics copied — paste them into a bug report.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toastError('Copy failed', diagnostics);
    }
  }, [diagnostics, success, toastError]);

  const openRelease = useCallback(
    (tag?: string | null) => {
      const url = tag
        ? `https://github.com/${REPO}/releases/tag/v${tag}`
        : `https://github.com/${REPO}/releases/latest`;
      void window.vault.system.openExternal(url);
    },
    []
  );

  return (
    <PageShell title="About" subtitle="v6 · Neo — rebuilt for speed, auto yt-dlp, and clarity.">
      <div className="space-y-5">
        {/* Hero — identity + live status + primary actions */}
        <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-500/15 via-accent-500/10 to-cyan-400/15 p-[1px] shadow-v6-glow">
          <div className="rounded-[15px] bg-gradient-to-br from-vault-800/90 to-vault-900/70 p-6 backdrop-blur-xl">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-accent-500 to-cyan-400 shadow-glow">
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
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight text-white">
                  PlaylistVault
                  <span className="rounded-full bg-gradient-to-r from-accent-500 to-cyan-400 px-2 py-0.5 text-[11px] font-black tracking-widest text-white">V6</span>
                  <StatusPill update={update} />
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-300">
                  <span>Version {info?.version ?? '—'}</span>
                  <span className="text-slate-600">·</span>
                  <span>{info?.platform ?? ''}</span>
                  <span className="text-slate-600">·</span>
                  <span>Neo engine</span>
                  <button
                    onClick={() => void copyDiagnostics()}
                    title="Copy version + diagnostics"
                    aria-label="Copy version and diagnostics"
                    className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                  >
                    {copied ? <FiCheck className="h-3.5 w-3.5 text-emerald-400" /> : <FiCopy className="h-3.5 w-3.5" />}
                  </button>
                </p>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-400">
                  A local-first playlist archiver. Everything runs on your machine — no accounts, no
                  telemetry, no cloud. v6 adds automatic yt-dlp updates and a Neo redesign.
                </p>
                <p className="mt-2.5 text-xs text-slate-400">
                  Built by <span className="font-semibold text-white">Franklin Alegu (FA)</span> · v6 rewrite
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
              {update.status === 'ready' ? (
                <button onClick={() => void window.vault.updates.install()} className="btn-primary">
                  Restart & install {update.version ? `v${update.version}` : ''}
                </button>
              ) : (
                <button
                  onClick={() => void window.vault.updates.check()}
                  disabled={update.status === 'checking' || update.status === 'downloading'}
                  className="btn-primary"
                >
                  <FiRefreshCw className={`h-4 w-4 ${update.status === 'checking' ? 'animate-spin' : ''}`} />
                  {update.status === 'checking' ? 'Checking…' : update.status === 'up-to-date' ? 'Check again' : 'Check for updates'}
                </button>
              )}
              <button onClick={() => openRelease(update.version)} className="btn-ghost">
                <FiFileText className="h-4 w-4" />
                Release notes
              </button>
              {!isWebBuild() && (
                <button onClick={() => navigate('/settings')} className="btn-ghost">
                  Engine settings
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Updates — status, progress, changelog */}
        <section className="glass p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <FiActivity className="h-4 w-4 text-accent-300" />
            Updates
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            {update.status === 'up-to-date'
              ? `You're on the newest published release${info?.version ? ` (v${info.version})` : ''}. Checks run at startup and every 6 hours.`
              : update.status === 'idle'
                ? 'No check has run yet this session — startup checks run 8 seconds after launch.'
                : update.status === 'available'
                  ? `v${update.version} found — downloading in the background. Keep the app open.`
                  : update.status === 'downloading'
                    ? `Downloading v${update.version ?? 'update'}…`
                    : update.status === 'ready'
                      ? `v${update.version} is downloaded and ready — restart to apply it.`
                      : 'The last check ran into a problem. Retry, or grab the installer below.'}
          </p>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-300">{describeUpdate(update)}</p>
              {update.status === 'downloading' && (
                <ProgressBar value={update.percent ?? 0} className="mt-3 w-full max-w-md" />
              )}
            </div>
            {update.status !== 'ready' && (
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
          {notes && (update.status === 'available' || update.status === 'ready' || update.status === 'downloading') && (
            <details className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3" open={update.status === 'ready'}>
              <summary className="cursor-pointer text-xs font-semibold text-accent-200">
                What's new in v{update.version}
              </summary>
              <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-400">
                {notes}
              </pre>
            </details>
          )}
          {update.status === 'up-to-date' && (
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Installers — download on request
              </h4>
              <DesktopDownloads />
            </div>
          )}
        </section>

        {/* Engine health — yt-dlp / ffmpeg at a glance */}
        {!isWebBuild() && (
          <section className="glass p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Engine health</h3>
              <button onClick={() => navigate('/settings')} className="text-xs font-medium text-accent-300 hover:text-accent-200">
                Manage in Settings →
              </button>
            </div>
            {bins === null ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="skeleton h-10 w-full" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {bins.map((b) => (
                  <li key={b.name} className="flex items-center gap-3 py-2.5">
                    {b.found ? (
                      <FiCheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <FiXCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    )}
                    <span className="w-20 shrink-0 font-mono text-xs font-semibold text-white">{b.name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-400" title={b.found ? b.version ?? b.path : b.error}>
                      {b.found ? b.version ?? 'installed' : b.error ?? 'Not found'}
                    </span>
                    {!b.found && (
                      <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">
                        action needed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Diagnostics — everything support needs in one copy */}
        <section className="glass p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Diagnostics</h3>
            <button onClick={() => void copyDiagnostics()} className="btn-ghost px-3 py-1.5 text-xs">
              {copied ? <FiCheck className="h-3.5 w-3.5 text-emerald-400" /> : <FiCopy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy all'}
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-xs">
            <Row label="App version" value={info?.version ? `v${info.version}` : undefined} />
            <Row label="Platform" value={info?.platform} />
            <Row label="Electron" value={info?.electron} />
            <Row label="Chromium" value={info?.chrome} />
            <Row label="Node.js" value={info?.node} />
            <Row label="Update channel" value="stable (GitHub releases)" />
            {(bins ?? info?.binaries ?? []).map((b) => (
              <Row key={b.name} label={b.name} value={b.found ? b.version ?? 'installed' : 'Not found'} />
            ))}
          </dl>
          {info && !isWebBuild() && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
              <button
                onClick={() => void window.vault.system.openPath(info.userDataPath)}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                <FiFolder className="h-3.5 w-3.5" />
                App data folder
              </button>
              <button
                onClick={() => void window.vault.system.openLog().then((r) => {
                  if (!r.ok) toastError('Could not open log', r.error);
                })}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                <FiFileText className="h-3.5 w-3.5" />
                Open log
              </button>
            </div>
          )}
        </section>

        <section className="glass p-5">
          <h3 className="mb-2 text-sm font-semibold text-white">
            {isWebBuild() ? 'Web app — no install needed' : 'Web + install options'}
          </h3>
          <p className="mb-4 text-xs leading-relaxed text-slate-400">
            {isWebBuild()
              ? isStandalonePwa()
                ? 'You are running the installed web app. It works offline for the shell; analysis and saves use the hosted service.'
                : 'You are using PlaylistVault directly in the browser — nothing was installed. You can keep using it here or install it as an app.'
              : 'Prefer the browser? The same app runs on the web with no install, and it is installable as a PWA.'}
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <InstallButton compact />
          </div>
          {update.status !== 'up-to-date' && (
            <>
              <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Desktop apps — download on request
              </h4>
              <DesktopDownloads />
            </>
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

        {!isWebBuild() && (
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
        )}
      </div>
    </PageShell>
  );
}

function StatusPill({ update }: { update: UpdateState }): JSX.Element {
  const base = 'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest';
  switch (update.status) {
    case 'up-to-date':
      return (
        <span className={`${base} bg-emerald-500/15 text-emerald-300`} title="You're on the newest published release">
          ● up to date
        </span>
      );
    case 'available':
    case 'downloading':
      return (
        <span className={`${base} bg-cyan-500/15 text-cyan-300`} title={`v${update.version} is on its way`}>
          ● updating{update.status === 'downloading' ? ` ${update.percent ?? 0}%` : ''}
        </span>
      );
    case 'ready':
      return (
        <span className={`${base} bg-violet-500/20 text-violet-200`} title="Restart to apply the update">
          ● restart to install
        </span>
      );
    case 'error':
      return (
        <span className={`${base} bg-rose-500/15 text-rose-300`} title={update.message ?? 'Update check failed'}>
          ● check failed
        </span>
      );
    default:
      return (
        <span className={`${base} bg-white/10 text-slate-400`} title="No check has run yet this session">
          ● standby
        </span>
      );
  }
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
