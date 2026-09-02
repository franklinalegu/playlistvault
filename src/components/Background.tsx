import { useEffect } from 'react';
import { useSettings } from '@/contexts/SettingsContext';

export type BgPreset = 'neo-mesh' | 'minimal' | 'aurora' | 'midnight' | 'clean-light';

export const BG_PRESETS: { id: BgPreset; label: string; desc: string; swatch: string }[] = [
  { id: 'neo-mesh', label: 'Neo Mesh', desc: 'Vibrant v6 default', swatch: 'from-violet-500 via-accent-500 to-cyan-400' },
  { id: 'minimal', label: 'Minimal', desc: 'Clean, airy, subtle', swatch: 'from-slate-400 via-slate-500 to-slate-600' },
  { id: 'aurora', label: 'Aurora', desc: 'Soft violet → cyan glow', swatch: 'from-violet-500 via-accent-500 to-cyan-400' },
  { id: 'midnight', label: 'Midnight', desc: 'Deep slate, ultra minimal', swatch: 'from-slate-800 via-slate-900 to-black' },
  { id: 'clean-light', label: 'Clean Light', desc: 'Light minimalistic', swatch: 'from-slate-100 via-indigo-50 to-slate-50' },
];

export function Background(): JSX.Element {
  const { settings } = useSettings();
  const preset = (settings as unknown as { background?: BgPreset }).background ?? 'neo-mesh';

  useEffect(() => {
    document.documentElement.setAttribute('data-bg', preset);
  }, [preset]);

  // Fixed layered gradients — non-interactive, behind app
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Minimal noise texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }} />
      {/* Subtle animated orbs per preset */}
      {preset === 'aurora' && (
        <>
          <div className="absolute -top-32 -left-32 h-[520px] w-[680px] rounded-full bg-gradient-to-br from-violet-500/12 to-transparent blur-3xl animate-floaty" />
          <div className="absolute -top-20 -right-32 h-[460px] w-[600px] rounded-full bg-gradient-to-br from-cyan-400/10 to-transparent blur-3xl animate-floaty" style={{ animationDelay: '2s' }} />
        </>
      )}
      {preset === 'minimal' && (
        <div className="absolute left-1/2 top-[-8%] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-b from-accent-500/08 to-transparent blur-3xl" />
      )}
      {preset === 'neo-mesh' && (
        <>
          <div className="absolute left-[4%] top-[-6%] h-[520px] w-[720px] rounded-full bg-gradient-to-br from-accent-500/14 to-transparent blur-3xl" />
          <div className="absolute right-[2%] top-[-4%] h-[480px] w-[640px] rounded-full bg-gradient-to-br from-cyan-400/10 to-transparent blur-3xl" />
        </>
      )}
    </div>
  );
}
