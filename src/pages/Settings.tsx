import { useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiCpu,
  FiDownloadCloud,
  FiExternalLink,
  FiFileText,
  FiFolder,
  FiKey,
  FiRefreshCw,
  FiRotateCcw,
  FiXCircle
} from 'react-icons/fi';
import type { BinaryStatus, DependencyProgress, PostDownloadAction, ThemeMode } from '@shared/types';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { PageShell, ProgressBar, Select, Toggle } from '@/components/ui';
import { CompatibilityPanel } from '@/components/CompatibilityBanner';

export function Settings(): JSX.Element {
  const { settings, update, reset } = useSettings();
  const { success, error } = useToast();
  const [binaries, setBinaries] = useState<BinaryStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [depProgress, setDepProgress] = useState<Record<string, DependencyProgress>>({});

  const checkBinaries = async (): Promise<void> => {
    setChecking(true);
    const res = await window.vault.system.checkBinaries();
    if (res.ok) setBinaries(res.data);
    setChecking(false);
  };

  const installDep = async (name: 'yt-dlp' | 'ffmpeg'): Promise<void> => {
    setInstalling(name);
    setDepProgress((prev) => ({ ...prev, [name]: { name, stage: 'downloading', percent: 0, message: 'Starting…' } }));
    const res = await window.vault.system.installDependency(name);
    if (res.ok) {
      success(`${name} installed`, 'Re-checking…');
      setDepProgress((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } else {
      setDepProgress((prev) => ({ ...prev, [name]: { name, stage: 'error', percent: 0, message: res.error } }));
      error(`Failed to install ${name}`, res.error);
    }
    await checkBinaries();
    setInstalling(null);
  };

  useEffect(() => {
    void checkBinaries();
    const off = window.vault.system.onDependencyProgress((p) => {
      setDepProgress((prev) => ({ ...prev, [p.name]: p }));
      if (p.stage === 'done' || p.stage === 'error') {
        // keep error visible, clear done after a moment
        if (p.stage === 'done') setTimeout(() => setDepProgress((prev) => { const n={...prev}; delete n[p.name]; return n; }), 1200);
      }
    });
    return off;
  }, []);

  const chooseFolder = async (): Promise<void> => {
    const res = await window.vault.system.chooseFolder(settings.defaultDestination);
    if (res.ok && res.data) {
      await update({ defaultDestination: res.data });
      success('Default folder updated');
    } else if (!res.ok) {
      error('Could not set folder', res.error);
    }
  };

  return (
    <PageShell
      title="Settings"
      subtitle="v6 preferences — everything saves instantly. Neo engine & auto yt-dlp below."
      actions={
        <button
          onClick={async () => {
            await reset();
            success('Settings restored to defaults');
          }}
          className="btn-ghost"
        >
          <FiRotateCcw className="h-4 w-4" />
          Reset
        </button>
      }
    >
      <div className="space-y-5">
        <Section title="Appearance">
          <Select<ThemeMode>
            label="Theme"
            value={settings.theme}
            onChange={(theme) => void update({ theme })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'Match Windows' }
            ]}
          />
          <div className="mt-4">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Background
            </span>
            <div className="grid grid-cols-5 gap-2">
              {([
                { id: 'neo-mesh', label: 'Neo Mesh' },
                { id: 'minimal', label: 'Minimal' },
                { id: 'aurora', label: 'Aurora' },
                { id: 'midnight', label: 'Midnight' },
                { id: 'clean-light', label: 'Light' }
              ] as const).map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => void update({ background: bg.id } as Partial<typeof settings>)}
                  className={`group relative flex h-[56px] flex-col items-start justify-end overflow-hidden rounded-xl border p-2 text-left transition ${
                    (settings as unknown as { background: string }).background === bg.id
                      ? 'border-violet-400/50 ring-2 ring-violet-400/30'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  title={bg.label}
                >
                  <span
                    className="absolute inset-0 opacity-90"
                    style={{
                      background:
                        bg.id === 'neo-mesh'
                          ? 'radial-gradient(60% 80% at 30% 10%, rgba(99,102,241,0.35), transparent 60%), linear-gradient(180deg,#0A0D1E,#060815)'
                          : bg.id === 'minimal'
                          ? 'radial-gradient(60% 60% at 50% 0%, rgba(99,102,241,0.16), transparent 60%), linear-gradient(180deg,#080A18,#070A16)'
                          : bg.id === 'aurora'
                          ? 'radial-gradient(60% 70% at 20% 0%, rgba(139,92,246,0.28), transparent 60%), radial-gradient(50% 60% at 85% 0%, rgba(6,182,214,0.22), transparent 60%), linear-gradient(180deg,#060815,#0A0D1E)'
                          : bg.id === 'midnight'
                          ? 'linear-gradient(180deg,#0F172A,#020617)'
                          : 'linear-gradient(180deg,#F8FAFC,#EEF2FF)'
                    }}
                  />
                  <span className="relative text-[11px] font-bold text-white drop-shadow" style={{ color: bg.id === 'clean-light' ? '#0F172A' : undefined }}>{bg.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Clean minimalistic gradients — Minimal & Aurora are most subtle.</p>
          </div>
          <div className="mt-4">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Accent color
            </span>
            <div className="flex gap-2">
              {['#6366f1', '#4F46E5', '#0EA5E9', '#06B6D4', '#8B5CF6', '#10B981'].map((color) => (
                <button
                  key={color}
                  onClick={() => void update({ accentColor: color })}
                  aria-label={`Accent ${color}`}
                  className={`h-8 w-8 rounded-lg transition ${
                    settings.accentColor === color
                      ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-vault-950'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Downloads">
          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Default folder
            </span>
            <div className="flex gap-2">
              <div className="input flex-1 truncate py-2.5 text-xs text-slate-400">
                {settings.defaultDestination || 'Not set'}
              </div>
              <button onClick={() => void chooseFolder()} className="btn-ghost shrink-0">
                <FiFolder className="h-4 w-4" />
                Browse
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <Select
              label="Default quality"
              value={settings.defaultOptions.quality}
              onChange={(quality) => void update({ defaultOptions: { ...settings.defaultOptions, quality } })}
              options={[
                { value: 'best', label: 'Best available' },
                { value: '2160p', label: '2160p' },
                { value: '1440p', label: '1440p' },
                { value: '1080p', label: '1080p' },
                { value: '720p', label: '720p' },
                { value: '480p', label: '480p' },
                { value: '360p', label: '360p' }
              ]}
            />
            <Select
              label="Default container"
              value={settings.defaultOptions.container}
              onChange={(container) =>
                void update({ defaultOptions: { ...settings.defaultOptions, container } })
              }
              options={[
                { value: 'mp4', label: 'MP4' },
                { value: 'mkv', label: 'MKV' },
                { value: 'webm', label: 'WebM' }
              ]}
            />
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
              Playlists downloading at once
              <span className="tabular-nums text-slate-300">{settings.maxConcurrentJobs}</span>
            </span>
            <input
              type="range"
              min={1}
              max={4}
              value={settings.maxConcurrentJobs}
              onChange={(e) => void update({ maxConcurrentJobs: Number(e.target.value) })}
              className="w-full accent-accent"
              aria-label="Concurrent playlists"
            />
          </label>
        </Section>

        <Section title="Speed &amp; network">
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
              Global speed limit
              <span className="tabular-nums text-slate-300">
                {settings.globalSpeedLimitKbps === 0
                  ? 'Unlimited'
                  : settings.globalSpeedLimitKbps >= 1000
                    ? `${(settings.globalSpeedLimitKbps / 1000).toFixed(1)} MB/s`
                    : `${settings.globalSpeedLimitKbps} KB/s`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={50000}
              step={100}
              value={settings.globalSpeedLimitKbps}
              onChange={(e) => void update({ globalSpeedLimitKbps: Number(e.target.value) })}
              className="w-full accent-accent"
              aria-label="Global speed limit"
            />
            <p className="mt-1.5 text-[11px] text-slate-600">
              Set to 0 for unlimited speed. Applies to all downloads globally.
            </p>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <Select
              label="Proxy type"
              value={settings.proxy.type}
              onChange={(type) =>
                void update({ proxy: { ...settings.proxy, type: type as 'http' | 'https' | 'socks5' } })
              }
              options={[
                { value: 'http', label: 'HTTP' },
                { value: 'https', label: 'HTTPS' },
                { value: 'socks5', label: 'SOCKS5' }
              ]}
            />
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Port
              </span>
              <input
                type="number"
                min={1}
                max={65535}
                value={settings.proxy.port}
                onChange={(e) =>
                  void update({ proxy: { ...settings.proxy, port: Number(e.target.value) } })
                }
                className="input w-full"
                placeholder="8080"
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Host
              </span>
              <input
                type="text"
                value={settings.proxy.host}
                onChange={(e) =>
                  void update({ proxy: { ...settings.proxy, host: e.target.value } })
                }
                className="input w-full"
                placeholder="127.0.0.1"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Username (optional)
              </span>
              <input
                type="text"
                value={settings.proxy.username ?? ''}
                onChange={(e) =>
                  void update({ proxy: { ...settings.proxy, username: e.target.value } })
                }
                className="input w-full"
                placeholder=""
              />
            </div>
          </div>
          <Toggle
            label="Enable proxy"
            description="Route all downloads through a proxy server."
            checked={settings.proxy.enabled}
            onChange={(enabled) => void update({ proxy: { ...settings.proxy, enabled } })}
          />
        </Section>

        <Section title="Notifications &amp; behavior">
          <div className="divide-y divide-white/[0.06]">
            <Toggle
              label="Windows notifications"
              description="Show a toast when a playlist finishes downloading."
              checked={settings.notificationsEnabled}
              onChange={(notificationsEnabled) => void update({ notificationsEnabled })}
            />
            <Toggle
              label="Notify for every video"
              description="Noisy on long playlists — off by default."
              checked={settings.notifyOnEachVideo}
              disabled={!settings.notificationsEnabled}
              onChange={(notifyOnEachVideo) => void update({ notifyOnEachVideo })}
            />
            <Toggle
              label="Save resource links page with every download"
              description="A clickable HTML index of each video's source, channel and description links."
              checked={settings.defaultOptions.writeResourceManifest}
              onChange={(writeResourceManifest) =>
                void update({ defaultOptions: { ...settings.defaultOptions, writeResourceManifest } })
              }
            />
            <Toggle
              label="Clipboard monitoring"
              description="Offer to analyze YouTube playlist links you copy anywhere in Windows."
              checked={settings.clipboardMonitoring}
              onChange={(clipboardMonitoring) => void update({ clipboardMonitoring })}
            />
            <Toggle
              label="Check for updates automatically"
              description="Checks for PlaylistVault app updates."
              checked={settings.autoCheckUpdates}
              onChange={(autoCheckUpdates) => void update({ autoCheckUpdates })}
            />
            <Toggle
              label="Keep yt-dlp up to date automatically"
              description="Downloads the latest YouTube engine in the background (startup + every 12h). Recommended — YouTube changes break old builds."
              checked={(settings as unknown as { autoUpdateYtDlp?: boolean }).autoUpdateYtDlp ?? true}
              onChange={(autoUpdateYtDlp) => void update({ autoUpdateYtDlp } as Partial<typeof settings>)}
            />
            <Toggle
              label="Confirm before quitting during a download"
              checked={settings.confirmBeforeQuit}
              onChange={(confirmBeforeQuit) => void update({ confirmBeforeQuit })}
            />
            <Toggle
              label="Keyboard shortcuts"
              description="Use Ctrl+Enter to start downloads, Escape to cancel, etc."
              checked={settings.keyboardShortcutsEnabled}
              onChange={(keyboardShortcutsEnabled) => void update({ keyboardShortcutsEnabled })}
            />
          </div>
        </Section>

        <Section title="Post-download action">
          <Select<PostDownloadAction>
            label="After all downloads complete"
            value={settings.postDownloadAction}
            onChange={(postDownloadAction) => void update({ postDownloadAction })}
            options={[
              { value: 'none', label: 'Do nothing' },
              { value: 'shutdown', label: 'Shut down computer' },
              { value: 'sleep', label: 'Put computer to sleep' },
              { value: 'hibernate', label: 'Hibernate computer' }
            ]}
          />
          <p className="mt-2 text-[11px] text-slate-600">
            The action will be scheduled 10 seconds after all downloads finish.
          </p>
        </Section>

        <Section title="Sign-in & platform access">
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            YouTube, Udemy and other platforms may require a signed-in session. PlaylistVault reads it
            locally and never uploads or stores cookies. Close the selected browser before testing.
          </p>
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
              onClick={async () => {
                setTestingAuth(true);
                const result = await window.vault.system.testAuth();
                setTestingAuth(false);
                if (result.ok) success('YouTube session verified', result.data);
                else error('YouTube session failed', result.error);
              }}
            >
              {testingAuth ? 'Testing…' : 'Test session'}
            </button>
          </div>

          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="mb-2 text-xs leading-relaxed text-slate-500">
              For Udemy courses, export your browser session as a Netscape <code className="rounded bg-black/30 px-1">cookies.txt</code> file
              (e.g. with the “Get cookies.txt” extension) and select it here.
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
                <span className="truncate">
                  {settings.cookiesFile ?? 'No cookies.txt selected'}
                </span>
              </div>
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={async () => {
                  const res = await window.vault.system.chooseFile();
                  if (res.ok && res.data) {
                    await update({ cookiesFile: res.data });
                    success('Cookies file set', res.data);
                  }
                }}
              >
                {settings.cookiesFile ? 'Change' : 'Choose file'}
              </button>
              {settings.cookiesFile && (
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  onClick={() => void update({ cookiesFile: undefined })}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Dependencies"
          action={
            <button onClick={() => void checkBinaries()} disabled={checking} className="btn-ghost text-xs">
              <FiRefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
              Re-check
            </button>
          }
        >
          <div className="space-y-3">
            {binaries.map((bin) => {
              const p = depProgress[bin.name];
              const isInstalling = installing === bin.name || (p && p.stage === 'downloading' && !bin.found);
              return (
                <div
                  key={bin.name}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {bin.found ? (
                      <FiCheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
                    ) : p?.stage === 'error' ? (
                      <FiAlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                    ) : (
                      <FiXCircle className="h-5 w-5 shrink-0 text-rose-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200">{bin.name}</p>
                      <p className="truncate text-[11px] text-slate-500" title={bin.error ?? bin.path}>
                        {bin.found ? bin.version : bin.error ?? 'Not found — click Install'}
                      </p>
                      {!bin.found && bin.path && (
                        <p className="truncate text-[10px] text-slate-600" title={bin.path}>Tried: {bin.path}</p>
                      )}
                    </div>
                    {!bin.found ? (
                      <button
                        onClick={() => void installDep(bin.name as 'yt-dlp' | 'ffmpeg')}
                        disabled={!!installing}
                        className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                      >
                        <FiDownloadCloud className="h-3.5 w-3.5" />
                        {isInstalling ? 'Installing…' : p?.stage === 'error' ? 'Retry' : 'Install'}
                      </button>
                    ) : (
                      <button
                        onClick={() => void installDep(bin.name as 'yt-dlp' | 'ffmpeg')}
                        disabled={!!installing}
                        className="btn-ghost shrink-0 px-2.5 py-1 text-xs opacity-70"
                        title="Reinstall to update"
                      >
                        Update
                      </button>
                    )}
                  </div>
                  {p && p.stage !== 'error' && !bin.found && (
                    <div className="mt-3">
                      <ProgressBar value={p.percent} indeterminate={p.stage === 'extracting'} />
                      <p className="mt-1.5 text-[11px] tabular-nums text-slate-400">{p.message}</p>
                    </div>
                  )}
                  {p?.stage === 'error' && (
                    <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                      <p className="text-[11px] leading-relaxed text-amber-200/90">{p.message}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={() => void installDep(bin.name as 'yt-dlp' | 'ffmpeg')} className="btn-ghost px-2 py-1 text-[11px]">Retry</button>
                        <button onClick={() => void window.vault.system.openLog().then(r => { if (!r.ok) error('Could not open log', r.error); })} className="btn-ghost px-2 py-1 text-[11px]"><FiFileText className="h-3 w-3" /> Open log</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Actionable manual fallback — end users are not devs, hide npm run */}
            <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-cyan-400/10 px-4 py-3">
              <p className="text-xs font-semibold text-violet-200">Manual install (if auto fails)</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Antivirus often quarantines <code className="rounded bg-black/30 px-1">yt-dlp.exe</code>. Allow it in <span className="text-slate-200">Windows Security → Protection history</span>, then click Install again. Or download directly:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => void window.vault.system.openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest')} className="chip glass-hover text-xs">yt-dlp releases <FiExternalLink className="h-3 w-3" /></button>
                <button onClick={() => void window.vault.system.openExternal('https://ffmpeg.org/download.html')} className="chip glass-hover text-xs">FFmpeg <FiExternalLink className="h-3 w-3" /></button>
                <button onClick={() => window.vault.system.openPath('').then(()=>{}).catch(()=>{})} className="chip glass-hover text-xs hidden">appdata</button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Place files in the app data folder shown in <span className="font-medium text-slate-300">About → App data folder</span>, then Re-check.</p>
            </div>
          </div>
        </Section>

        <Section title="System compatibility">
          <p className="mb-3 flex items-center gap-1.5 text-xs leading-relaxed text-slate-500">
            <FiCpu className="h-3 w-3" /> Detected hardware & OS — suggests the best version and auto-tunes performance.
          </p>
          <CompatibilityPanel />
        </Section>

        <Section title="Diagnostics">
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            PlaylistVault writes a log of downloads and errors. If something goes wrong, open the
            log and include it in your bug report — paths and credentials are masked automatically.
          </p>
          <button
            onClick={async () => {
              const res = await window.vault.system.openLog();
              if (!res.ok) error('Could not open the log', res.error);
            }}
            className="btn-ghost"
          >
            <FiFileText className="h-4 w-4" />
            Open log file
          </button>
        </Section>

        <Section title="Storage">
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
              Keep history for
              <span className="tabular-nums text-slate-300">
                {settings.keepHistoryDays === 0 ? 'Forever' : `${settings.keepHistoryDays} days`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={730}
              step={30}
              value={settings.keepHistoryDays}
              onChange={(e) => void update({ keepHistoryDays: Number(e.target.value) })}
              className="w-full accent-accent"
              aria-label="History retention"
            />
          </label>
        </Section>
      </div>
    </PageShell>
  );
}

function Section({
  title,
  action,
  children
}: {
  title: string;
  action?: JSX.Element;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
