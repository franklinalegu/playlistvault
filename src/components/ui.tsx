import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function PageShell({
  title,
  subtitle,
  actions,
  children
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-[1080px] px-8 py-7"
    >
      <div className="mb-8 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center rounded-full border border-violet-400/20 bg-gradient-to-r from-violet-500/20 to-cyan-400/15 px-2.5 py-1 text-[10px] font-black tracking-widest text-violet-200">
              V6 · NEO
            </span>
            <span className="h-2 w-2 rounded-full bg-gradient-to-br from-violet-400 via-accent-400 to-cyan-400 shadow-[0_0_10px_rgba(99,102,241,0.9)]" />
            <h1 className="text-[28px] font-extrabold tracking-[-0.04em] text-white">{title}</h1>
          </div>
          {subtitle && <p className="max-w-2xl pl-1 text-[13.5px] leading-relaxed text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>
      {children}
    </motion.div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="glass flex flex-col items-center justify-center gap-4 px-8 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-white/[0.06] to-cyan-400/10 text-slate-400 shadow-inner">
        <span className="animate-floaty text-[28px]">{icon}</span>
      </div>
      <h3 className="text-[15px] font-bold tracking-tight text-white">{title}</h3>
      <p className="max-w-sm text-[13px] leading-relaxed text-slate-400">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  indeterminate = false,
  className = ''
}: {
  value: number;
  indeterminate?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`relative h-1.5 w-full overflow-hidden rounded-full bg-black/30 p-[1px] shadow-inner ${className}`}
    >
      <div className="h-full w-full overflow-hidden rounded-full bg-white/10">
        {indeterminate ? (
          <div className="skeleton absolute inset-0" />
        ) : (
          <motion.div
            className="relative h-full rounded-full"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #8b5cf6, var(--accent), #06b6d4)',
              boxShadow: '0 0 12px rgba(99, 102, 241, 0.55)'
            }}
            initial={false}
            animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        )}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label
      className={`flex items-start justify-between gap-6 py-3 ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-all duration-200 ${
          checked
            ? 'bg-gradient-to-r from-accent-500 to-accent-400 shadow-[0_0_12px_rgba(79,70,229,0.45)]'
            : 'bg-white/12 border border-white/10'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
          className="absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ height: 18, width: 18, left: checked ? 24 : 4 }}
        />
      </button>
    </label>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="input cursor-pointer appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4.5 6 8.5l4-4' stroke='%2394a3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")"
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-vault-800 text-slate-100">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StatTile({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="surface group relative overflow-hidden px-4 py-3.5 transition-all hover:border-white/15 hover:bg-white/[0.06]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/20 to-cyan-400/20 opacity-0 transition-opacity group-hover:opacity-100" />
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1.5 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-[18px] font-extrabold tabular-nums text-transparent">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] font-medium text-slate-500">{hint}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }): JSX.Element {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    downloading: 'bg-accent/15 text-accent-200 border-accent/30',
    converting: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
    queued: 'bg-white/8 text-slate-400 border-white/12',
    paused: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    failed: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
    canceled: 'bg-white/5 text-slate-500 border-white/10',
    skipped: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    analyzing: 'bg-sky-500/15 text-sky-300 border-sky-500/25'
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        styles[status] ?? styles.queued
      }`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
          status === 'downloading'
            ? 'animate-pulse-soft bg-accent-400'
            : status === 'completed'
              ? 'bg-emerald-400'
              : status === 'failed'
                ? 'bg-rose-400'
                : 'bg-current opacity-50'
        }`}
      />
      {status}
    </span>
  );
}
