/* PlaylistVault web service worker — app-shell offline cache.
 * Cache-first for same-origin GET navigations/assets, network-first for /api/*.
 * Versioned so deploys invalidate cleanly.
 */
const CACHE = 'playlistvault-web-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache API — always go to network (yt-dlp results change fast).
  if (url.pathname.startsWith('/api/')) return;
  // Only handle same-origin to avoid interfering with thumbnails/CDNs.
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, fall back to cached shell for offline use.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Assets: cache-first.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
    )
  );
});
