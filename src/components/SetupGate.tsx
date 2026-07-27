import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { FiAlertTriangle, FiCheckCircle, FiDownloadCloud, FiRefreshCw } from 'react-icons/fi';
import type { BinaryStatus, DependencyName, DependencyProgress } from '@shared/types';
import { ProgressBar } from './ui';

const LABELS: Record<DependencyName, { title: string; blurb: string; size: string }> = {
  'yt-dlp': {
    title: 'yt-dlp',
    blurb: 'Reads playlists and fetches video streams.',
    size: '~18 MB'
  },
  ffmpeg: {
    title: 'FFmpeg',
    blurb: 'Merges video and audio, and converts formats.',
    size: '~90 MB download'
  }
};

/**
 * Blocks the app on first run until the external tools are present.
 *
 * They are downloaded on demand rather than bundled: FFmpeg alone would add
 * ~175 MB to the installer, and fetching yt-dlp here means users always start
 * on a current build (YouTube changes break older ones quickly).
 */
export function SetupGate({ children }: { children: ReactNode }): JSX.Element {
  const [binaries, setBinaries] = useState<BinaryStatus[] | null>(null);
  const [progress, setProgress] = useState<Partial<Record<DependencyName, DependencyProgress>>>({});
  const [busy, setBusy] = useState<DependencyName | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    const res = await window.vault.system.checkBinaries();
    if (res.ok) setBinaries(res.data);
    else setBinaries([]);
  }, []);

  useEffect(() => {
    void refresh();
    return window.vault.system.onDependencyProgress((p) =>
      setProgress((prev) => ({ ...prev, [p.name]: p }))
    );
  }, [refresh]);

  const install = useCallback(
    async (name: DependencyName) => {
      setBusy(name);
      const res = await window.vault.system.installDependency(name);
      if (!res.ok) {
        setProgress((prev) => ({
          ...prev,
          [name]: { name, stage: 'error', percent: 0, message: res.error }
        }));
      }
      await refresh();
      setBusy(null);
    },
    [refresh]
  );

  // Still checking — show nothing rather than flashing the setup screen.
  if (binaries === null) return <></>;

  const missing = binaries.filter((b) => !b.found);
  if (missing.length === 0 || dismissed) return <>{children}</>;

  const installAll = async (): Promise<void> => {
    for (const bin of missing) await install(bin.name);
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="glass w-full max-w-xl p-8"
      >
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-sky-500 shadow-glow">
            <FiDownloadCloud className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">One-time setup</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              PlaylistVault needs two free tools before it can download anything.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {binaries.map((bin) => {
            const meta = LABELS[bin.name];
            const p = progress[bin.name];
            const installing = busy === bin.name;

            return (
              <div
                key={bin.name}
                className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4"
              >
                <div className="flex items-center gap-3">
                  {bin.found ? (
                    <FiCheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : p?.stage === 'error' ? (
                    <FiAlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-slate-600" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-100">
                      {meta.title}
                      {!bin.found && (
                        <span className="ml-2 text-[11px] font-normal text-slate-500">
                          {meta.size}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {bin.found ? bin.version : meta.blurb}
                    </p>
                  </div>

                  {!bin.found && (
                    <button
                      onClick={() => void install(bin.name)}
                      disabled={busy !== null}
                      className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                    >
                      {installing ? 'Installing…' : p?.stage === 'error' ? 'Retry' : 'Install'}
                    </button>
                  )}
                </div>

                {!bin.found && p && p.stage !== 'error' && (
                  <div className="mt-3">
                    <ProgressBar
                      value={p.percent}
                      indeterminate={p.stage === 'extracting'}
                    />
                    <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">
                      {p.stage === 'extracting' ? 'Extracting…' : p.message}
                    </p>
                  </div>
                )}

                {p?.stage === 'error' && (
                  <p className="mt-2 text-[11px] leading-relaxed text-rose-300/80">{p.message}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => void refresh()}
            disabled={busy !== null}
            className="btn-ghost px-3 py-2 text-xs"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Re-check
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDismissed(true)}
              disabled={busy !== null}
              className="btn-ghost px-3 py-2 text-xs"
            >
              Skip for now
            </button>
            <button
              onClick={() => void installAll()}
              disabled={busy !== null}
              className="btn-primary px-5"
            >
              <FiDownloadCloud className="h-4 w-4" />
              {busy ? 'Installing…' : `Install ${missing.length > 1 ? 'both' : meta_name(missing)}`}
            </button>
          </div>
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-slate-600">
          These are downloaded from their official releases into this app's data folder. You can
          also install them yourself and point PlaylistVault at them in Settings → Dependencies.
        </p>
      </motion.div>
    </div>
  );
}

function meta_name(missing: BinaryStatus[]): string {
  return missing[0] ? LABELS[missing[0].name].title : 'tools';
}
