import { useCallback, useEffect, useState } from 'react';
import { isStandalonePwa } from '@/web/detect';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Tracks PWA installability. `canInstall` becomes true when Chromium fires
 * `beforeinstallprompt`; iOS Safari never fires it, so we surface manual
 * "Add to Home Screen" guidance instead.
 */
export function usePwaInstall(): {
  canInstall: boolean;
  installed: boolean;
  isIos: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(
    () => typeof window !== 'undefined' && isStandalonePwa()
  );
  const [isIos] = useState<boolean>(() =>
    typeof navigator === 'undefined'
      ? false
      : /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
  );

  useEffect(() => {
    const onBefore = (e: Event): void => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setDeferred(null);
    return outcome;
  }, [deferred]);

  return { canInstall: deferred !== null, installed, isIos, promptInstall };
}
