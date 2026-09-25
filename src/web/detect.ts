/**
 * Web-environment detection for PlaylistVault.
 *
 * Desktop (Electron) exposes `window.vault` via contextBridge before React
 * mounts. In a plain browser (Vercel web build / PWA) it is absent, so we
 * install a REST + localStorage backed implementation instead.
 */
export function isElectronRenderer(): boolean {
  // Electron preload runs in an isolated world; the userAgent still contains
  // "Electron" in most builds. The vault marker is the authoritative signal.
  return (
    typeof navigator !== 'undefined' &&
    /Electron/i.test(navigator.userAgent) &&
    typeof (window as unknown as { vault?: unknown }).vault !== 'undefined'
  );
}

export function hasNativeVault(): boolean {
  const v = (window as unknown as { vault?: { system?: { info?: unknown } } }).vault;
  // The Android Capacitor shim and our web shim both expose `vault`, so probe
  // for an Electron-only method to distinguish them.
  return !!v && typeof (v as unknown as { __pvWeb?: boolean }).__pvWeb === 'undefined' && !isCapacitorNative();
}

export function isCapacitorNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor !== 'undefined'
  );
}

/** True when running as an installed PWA (standalone) or on a hosted origin. */
export function isWebBuild(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = window.location.protocol;
  // file:// + HashRouter = packaged Electron. http(s) = web/PWA/dev server.
  if (proto === 'file:') return false;
  if (isElectronRenderer()) return false;
  return true;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
