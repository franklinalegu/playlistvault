import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { useSettings } from '@/contexts/SettingsContext';

/**
 * Renderer-side fallback for yt-dlp freshness.
 *
 * The main process now auto-updates yt-dlp in the background (startup + every
 * 12h + on reconnect). This component keeps the UI honest:
 *  - if autoUpdateYtDlp is ON (default) it silently triggers the update without
 *    waiting for the user to click — no manual action required;
 *  - if autoUpdateYtDlp is OFF it shows the previous "Update now" toast.
 *
 * YouTube/Udemy change often and an old yt-dlp stops reading links — this is
 * the most common cause of "downloads suddenly stopped working".
 */
export function YtDlpUpdateNotice(): JSX.Element {
  const { toast, success, error } = useToast();
  const { settings } = useSettings();
  const busyRef = useRef(false);

  const update = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    const res = await window.vault.system.installDependency('yt-dlp');
    busyRef.current = false;
    if (res.ok) {
      success('yt-dlp updated', 'Downloads will now use the latest version.');
    } else {
      error('Could not update yt-dlp', res.error);
    }
  }, [success, error]);

  useEffect(() => {
    let cancelled = false;
    // Small delay so startup stays snappy; main-process updater runs at 20s,
    // this is a fallback in case that didn't fire (e.g. dev mode).
    const timer = setTimeout(() => {
      void window.vault.system.checkYtDlpUpdate().then((res) => {
        if (cancelled || !res.ok || !res.data.outdated) return;
        const auto = (settings as unknown as { autoUpdateYtDlp?: boolean }).autoUpdateYtDlp ?? true;
        if (auto) {
          // Auto mode: update silently in background, toast only on result
          void update();
          toast({
            kind: 'info',
            title: 'Updating yt-dlp…',
            description: `Installed ${res.data.current ?? 'unknown'} → ${res.data.latest ?? 'unknown'}. Updating in background.`,
          });
          return;
        }
        toast({
          kind: 'warning',
          title: 'yt-dlp is out of date',
          description:
            `Installed ${res.data.current ?? 'unknown'}, latest ${res.data.latest ?? 'unknown'}. ` +
            'Older builds stop reading YouTube and Udemy links over time.',
          action: { label: 'Update now', onClick: () => void update() }
        });
      });
    }, 25_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [toast, update, settings]);

  return <></>;
}