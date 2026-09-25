import { isWebBuild } from '@/web/detect';

/**
 * Register /sw.js for the hosted web build only. In Electron (file://) a
 * service worker would break asset loading, so we skip it there.
 */
export function registerWebServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (!isWebBuild()) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
