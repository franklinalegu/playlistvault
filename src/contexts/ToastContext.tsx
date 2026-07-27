import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiX, FiXCircle } from 'react-icons/fi';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastKind, JSX.Element> = {
  success: <FiCheckCircle className="h-5 w-5 text-emerald-400" />,
  error: <FiXCircle className="h-5 w-5 text-rose-400" />,
  info: <FiInfo className="h-5 w-5 text-sky-400" />,
  warning: <FiAlertTriangle className="h-5 w-5 text-amber-400" />
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-4), { ...t, id }]);
      // Errors linger longer so they can actually be read.
      window.setTimeout(() => dismiss(id), t.kind === 'error' ? 8000 : 4500);
    },
    [dismiss]
  );

  const success = useCallback(
    (title: string, description?: string) => toast({ kind: 'success', title, description }),
    [toast]
  );
  const error = useCallback(
    (title: string, description?: string) => toast({ kind: 'error', title, description }),
    [toast]
  );

  const value = useMemo(() => ({ toast, success, error, dismiss }), [toast, success, error, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[380px] flex-col gap-3">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="glass pointer-events-auto flex items-start gap-3 p-4"
            >
              <div className="mt-0.5 shrink-0">{ICONS[t.kind]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                {t.description && (
                  <p className="mt-1 break-words text-xs leading-relaxed text-slate-400">
                    {t.description}
                  </p>
                )}
                {t.action && (
                  <button
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-2 text-xs font-semibold text-accent-300 hover:text-accent-200"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
              >
                <FiX className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
