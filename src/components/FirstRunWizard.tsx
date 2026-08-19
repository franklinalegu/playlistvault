import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiDownloadCloud,
  FiKey,
  FiRefreshCw
} from 'react-icons/fi';
import type { BinaryStatus, DependencyName, DependencyProgress } from '@shared/types';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { ProgressBar, Select } from './ui';

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

const STEPS = [
  { title: 'Tools', blurb: 'Install the two free engines the app needs.' },
  { title: 'Sign-in', blurb: 'Optional — only for age-restricted or Udemy content.' },
  { title: 'Ready', blurb: 'Your library, offline.' }
];

/**
 * Guided first-run wizard: install the external tools, then explain sign-in
 * (browser session for age-restricted YouTube, cookies.txt for Udemy courses)
 * and let the user test it. Existing installs are marked complete and never
 * see this; a fresh install walks through it once.
 */
export function FirstRunWizard({ children }: { children: ReactNode }): JSX.Element {
  const { settings, update } = useSettings();
  const { success, error: toastError } = useToast();
  const [binaries, setBinaries] = useState<BinaryStatus[] | null>(null);
  const [progress, setProgress] = useState<Partial<Record<DependencyName, DependencyProgress>>>({});
  const [busy, setBusy] = useState<DependencyName | null>(null);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);

  const refresh = useCallback(async () => {
    const res = await window.vault.system.checkBinaries();
    setBinaries(res.ok ? res.data : []);
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

  const installAll = async (): Promise<void> => {
    for (const bin of binaries?.filter((b) => !b.found) ?? []) await install(bin.name);
  };

  const testSession = async (): Promise<void> => {
    setTestingAuth(true);
    const result = await window.vault.system.testAuth();
    setTestingAuth(false);
    if (result.ok) success('YouTube session verified', result.data);
    else toastError('YouTube session failed', result.error);
  };

  const chooseCookies = async (): Promise<void> => {
    const res = await window.vault.system.chooseFile();
    if (res.ok && res.data) {
      await update({ cookiesFile: res.data });
      success('Cookies file set', res.data);
    }
  };

  if (binaries === null) return <></>;

  const missing = binaries.filter((b) => !b.found);
  const showWizard = !settings.firstRunComplete || missing.length > 0;
  if (!showWizard || dismissed) return <>{children}</>;

  const canContinueTools = missing.length === 0;

  return (
    <div className="flex h-full items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="glass w-full max-w-2xl p-8"
      >
        <div className="mb-8 flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition ${
                  i === step
                    ? 'bg-gradient-to-br from-accent-500 to-sky-500 text-white shadow-glow'
                    : i < step
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-white/[0.06] text-slate-500'
                }`}
              >
                {i < step ? <FiCheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{s.title}</p>
                <p className="hidden truncate text-[11px] text-slate-500 sm:block">{s.blurb}</p>
              </div>
              {i < STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-white/10" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-white">One-time setup</h1>
            <p className="mt-1 text-sm text-slate-400">
              PlaylistVault needs two free tools before it can download anything. They are fetched
              from their official releases into the app's data folder.
            </p>

            <div className="mt-5 space-y-3">
              {binaries.map((bin) => {
                const meta = LABELS[bin.name];
                const p = progress[bin.name];
                const installing = busy === bin.name;

                return (
                  <div key={bin.name} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
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
                        <ProgressBar value={p.percent} indeterminate={p.stage === 'extracting'} />
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
                {!canContinueTools && (
                  <button
                    onClick={() => {
                      if (settings.firstRunComplete) setDismissed(true);
                      else setStep(1);
                    }}
                    disabled={busy !== null}
                    className="btn-ghost px-3 py-2 text-xs"
                  >
                    Skip for now
                  </button>
                )}
                <button
                  onClick={() => (canContinueTools ? setStep(1) : void installAll())}
                  disabled={busy !== null}
                  className="btn-primary px-5"
                >
                  {canContinueTools ? (
                    <>
                      Continue
                      <FiChevronRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <FiDownloadCloud className="h-4 w-4" />
                      {busy ? 'Installing…' : `Install ${missing.length > 1 ? 'both' : LABELS[missing[0].name].title}`}
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-white">Sign in where needed</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Most content downloads without any session. Age-restricted YouTube videos and Udemy
              courses need one. PlaylistVault reads it locally and never uploads or stores your
              cookies. This step is optional and can be changed any time in Settings.
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                <div className="flex items-end gap-2">
                  <Select
                    label="Use cookies from"
                    value={settings.browserCookieSource}
                    onChange={(browserCookieSource) => void update({ browserCookieSource })}
                    options={[
                      { value: 'none', label: 'No browser session' },
                      { value: 'chrome', label: 'Google Chrome' },
                      { value: 'edge', label: 'Microsoft Edge' },
                      { value: 'firefox', label: 'Mozilla Firefox' }
                    ]}
                  />
                  <button
                    type="button"
                    className="btn-ghost shrink-0"
                    disabled={testingAuth || settings.browserCookieSource === 'none'}
                    onClick={() => void testSession()}
                  >
                    {testingAuth ? 'Testing…' : 'Test session'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Close the browser before testing, or the session may be locked.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="mb-2 text-xs leading-relaxed text-slate-400">
                  For Udemy courses, export your browser session as a Netscape{' '}
                  <code className="rounded bg-black/30 px-1">cookies.txt</code> file (e.g. with the
                  “Get cookies.txt” extension) and select it here.
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                      settings.cookiesFile
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90'
                        : 'border-white/[0.07] bg-white/[0.03] text-slate-500'
                    }`}
                    title={settings.cookiesFile}
                  >
                    <FiKey className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{settings.cookiesFile ?? 'No cookies.txt selected'}</span>
                  </div>
                  <button type="button" className="btn-ghost shrink-0" onClick={() => void chooseCookies()}>
                    {settings.cookiesFile ? 'Change' : 'Choose file'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button onClick={() => setStep(0)} className="btn-ghost px-3 py-2 text-xs">
                <FiChevronLeft className="h-4 w-4" />
                Back
              </button>
              <button onClick={() => setStep(2)} className="btn-primary px-5">
                Continue
                <FiChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/25 to-sky-500/15 text-emerald-300">
              <FiCheckCircle className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white">You're all set</h1>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-400">
              Paste a YouTube playlist, course, or channel link on the Home page and download it to
              your own drive. Everything runs locally.
            </p>
            <button
              onClick={() => void update({ firstRunComplete: true })}
              className="btn-primary mt-6 px-7"
            >
              Get started
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}