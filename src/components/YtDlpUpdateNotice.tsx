import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/contexts/ToastContext';

/**
 * Once per launch, compare the installed yt-dlp against the latest release
 * and offer a one-click refresh. YouTube and Udemy change their sites often,
 * and an old yt-dlp stops reading links — the most common cause of
 * "downloads suddenly stopped working".
 */
export function YtDlpUpdateNotice(): JSX.Element {
  const { toast, success, error } = useToast();
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
    void window.vault.system.checkYtDlpUpdate().then((res) => {
      if (cancelled || !res.ok || !res.data.outdated) return;
      toast({
        kind: 'warning',
        title: 'yt-dlp is out of date',
        description:
          `Installed ${res.data.current ?? 'unknown'}, latest ${res.data.latest ?? 'unknown'}. ` +
          'Older builds stop reading YouTube and Udemy links over time.',
        action: { label: 'Update now', onClick: () => void update() }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [toast, update]);

  return <></>;
}