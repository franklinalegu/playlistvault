import { useEffect, useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiDownloadCloud, FiMonitor, FiCpu, FiHardDrive, FiExternalLink } from 'react-icons/fi';
import type { CompatibilityReport } from '@shared/types';

export function CompatibilityBanner(): JSX.Element | null {
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void window.vault.system.compatibility().then((res) => {
      if (res.ok) setReport(res.data);
    });
  }, []);

  if (!report || dismissed) return null;
  if (report.overall === 'optimal') return null;

  const isFail = report.overall === 'incompatible';
  const tone = isFail ? 'border-rose-500/30 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/10';
  const icon = isFail ? <FiAlertTriangle className="h-5 w-5 text-rose-400" /> : <FiMonitor className="h-5 w-5 text-amber-400" />;
  const title = isFail ? 'System not optimal for this version' : 'Performance tip for your system';
  const primary = report.checks.find(c => c.status !== 'pass' && c.action);

  return (
    <div className={`mx-auto mb-4 flex w-full max-w-[1080px] items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl ${tone}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${isFail ? 'text-rose-200' : 'text-amber-200'}`}>{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">
          {primary?.message ?? `${report.profile.totalMemGB} GB RAM · ${report.profile.cpuCount} cores · ${report.profile.platform} ${report.profile.osRelease}`}
          {primary?.recommendation ? ` — ${primary.recommendation}` : ''}
        </p>
        {report.autoAppliedFixes.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
            {report.autoAppliedFixes.map(f => <span key={f} className="rounded-full bg-white/10 px-2 py-0.5">{f}</span>)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {primary?.link && (
          <button onClick={() => void window.vault.system.openExternal(primary.link!)} className="btn-ghost px-3 py-1.5 text-xs">
            <FiExternalLink className="h-3 w-3" /> {primary.action === 'downgrade' ? `Get v${primary.versionSuggestion}` : primary.action === 'upgrade' ? `Get v${primary.versionSuggestion}` : 'Learn more'}
          </button>
        )}
        {report.suggestedUrl && !primary?.link && (
          <button onClick={() => void window.vault.system.openExternal(report.suggestedUrl!)} className="btn-ghost px-3 py-1.5 text-xs">
            <FiDownloadCloud className="h-3 w-3" /> Get v{report.suggestedVersion}
          </button>
        )}
        <button onClick={() => setDismissed(true)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200">Dismiss</button>
      </div>
    </div>
  );
}

export function CompatibilityPanel(): JSX.Element {
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    const res = await window.vault.system.compatibility();
    if (res.ok) setReport(res.data);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  if (loading || !report) return <div className="glass p-5 text-xs text-slate-500">Checking system…</div>;

  const overallColor = report.overall === 'optimal' ? 'text-emerald-300' : report.overall === 'incompatible' ? 'text-rose-300' : 'text-amber-300';

  return (
    <div className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <FiCpu className="h-4 w-4 text-violet-300" /> System compatibility
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${overallColor} bg-white/5 border border-white/10`}>{report.overall.replace('_', ' ')}</span>
        </h2>
        <button onClick={() => void refresh()} className="btn-ghost px-2.5 py-1 text-xs">Re-check</button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="surface px-3 py-2"><p className="text-[10px] uppercase tracking-widest text-slate-500">OS</p><p className="mt-1 font-medium text-slate-200 truncate">{report.profile.osVersion || report.profile.osRelease} · {report.profile.arch}</p></div>
        <div className="surface px-3 py-2"><p className="text-[10px] uppercase tracking-widest text-slate-500">Hardware</p><p className="mt-1 font-medium text-slate-200">{report.profile.cpuCount} cores · {report.profile.totalMemGB} GB RAM</p></div>
        <div className="surface px-3 py-2"><p className="text-[10px] uppercase tracking-widest text-slate-500">App</p><p className="mt-1 font-medium text-slate-200">v{report.currentVersion}</p></div>
      </div>

      <div className="mt-4 space-y-2">
        {report.checks.map(c => (
          <div key={c.id} className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            {c.status === 'pass' ? <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : c.status === 'fail' ? <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" /> : <FiHardDrive className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200">{c.label} <span className={`ml-1 rounded px-1 py-0.5 text-[10px] uppercase tracking-widest ${c.status === 'pass' ? 'bg-emerald-500/15 text-emerald-300' : c.status === 'fail' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>{c.status}</span></p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{c.message}</p>
              {c.recommendation && <p className="mt-1 text-xs text-violet-200/80">→ {c.recommendation}</p>}
            </div>
            {c.link && <button onClick={() => void window.vault.system.openExternal(c.link!)} className="btn-ghost shrink-0 px-2 py-1 text-xs"><FiExternalLink className="h-3 w-3" />{c.action === 'downgrade' ? 'Downgrade' : c.action === 'upgrade' ? 'Upgrade' : 'Open'}</button>}
          </div>
        ))}
      </div>

      {report.suggestedVersion && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3">
          <FiDownloadCloud className="h-4 w-4 text-violet-300" />
          <p className="flex-1 text-xs text-violet-100">Recommended for your system: <span className="font-bold">v{report.suggestedVersion}</span></p>
          <button onClick={() => void window.vault.system.openExternal(report.suggestedUrl!)} className="btn-primary px-3 py-1.5 text-xs">Download</button>
        </div>
      )}
      {report.autoAppliedFixes.length > 0 && <p className="mt-3 text-[11px] text-slate-500">Auto-tuned: {report.autoAppliedFixes.join(' · ')}</p>}
    </div>
  );
}
