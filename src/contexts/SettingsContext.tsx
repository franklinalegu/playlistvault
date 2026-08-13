import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import type { AppSettings } from '@shared/types';
import { DEFAULT_DOWNLOAD_OPTIONS } from '@shared/types';

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

const FALLBACK: AppSettings = {
  theme: 'dark',
  accentColor: '#4F46E5',
  defaultDestination: '',
  defaultOptions: { ...DEFAULT_DOWNLOAD_OPTIONS },
  maxConcurrentJobs: 1,
  notificationsEnabled: true,
  notifyOnEachVideo: false,
  clipboardMonitoring: false,
  autoCheckUpdates: true,
  minimizeToTray: false,
  confirmBeforeQuit: true,
  keepHistoryDays: 365,
  recentDestinations: [],
  legalAcknowledged: false,
  browserCookieSource: 'none',
  proxy: { enabled: false, type: 'http', host: '', port: 8080 },
  globalSpeedLimitKbps: 0,
  postDownloadAction: 'none',
  keyboardShortcutsEnabled: true,
  showSpeedInNotification: false
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void window.vault.settings.get().then((res) => {
      if (!cancelled && res.ok) setSettings(res.data);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply theme + accent to the document whenever they change.
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = (): void => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark.matches);
      root.classList.toggle('dark', dark);
      root.classList.toggle('light', !dark);
    };

    apply();
    prefersDark.addEventListener('change', apply);
    return () => prefersDark.removeEventListener('change', apply);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor);
  }, [settings.accentColor]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    // Optimistic update keeps toggles feeling instant.
    setSettings((prev) => ({
      ...prev,
      ...patch,
      defaultOptions: { ...prev.defaultOptions, ...(patch.defaultOptions ?? {}) }
    }));
    const res = await window.vault.settings.update(patch);
    if (res.ok) setSettings(res.data);
  }, []);

  const reset = useCallback(async () => {
    const res = await window.vault.settings.reset();
    if (res.ok) setSettings(res.data);
  }, []);

  const value = useMemo(
    () => ({ settings, loading, update, reset }),
    [settings, loading, update, reset]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
