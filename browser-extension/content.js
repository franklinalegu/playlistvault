// PlaylistVault — detects any <video> playing and adds a quick overlay
(function () {
  if (window.__pvContentInjected) return;
  window.__pvContentInjected = true;

  function findBestVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const playing = videos.filter(v => !v.paused && !v.ended && v.currentSrc);
    const list = playing.length ? playing : videos;
    list.sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight));
    return list[0] || null;
  }

  // Badge / overlay hint — minimal, only when a video is detected
  let overlay = null;
  function ensureOverlay(video) {
    if (!video || video.dataset.pvOverlay === '1') return;
    // Don't overlay on tiny previews
    if (video.videoWidth < 160 && video.clientWidth < 160) return;
    const host = video.parentElement;
    if (!host) return;
    const style = getComputedStyle(host);
    if (style.position === 'static') host.style.position = 'relative';
    const badge = document.createElement('button');
    badge.textContent = '⭳ PlaylistVault';
    badge.title = 'Download this video to PC with PlaylistVault';
    badge.style.cssText = 'position:absolute;top:8px;right:8px;z-index:999999;background:linear-gradient(135deg,#6366f1,#06b6d4);color:white;border:none;border-radius:999px;padding:4px 10px;font:700 11px/1 Outfit,system-ui;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.3);opacity:0.92;transition:opacity 0.15s;';
    badge.addEventListener('mouseenter', () => badge.style.opacity = '1');
    badge.addEventListener('mouseleave', () => badge.style.opacity = '0.92');
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      let src = video.currentSrc || video.src || '';
      if (!src) {
        const s = video.querySelector('source[src]');
        if (s) src = s.getAttribute('src') || '';
      }
      if (!src || src.startsWith('blob:')) src = location.href;
      const target = `playlistvault://add?url=${encodeURIComponent(src)}&src=overlay`;
      window.open(target, '_blank');
    });
    host.appendChild(badge);
    video.dataset.pvOverlay = '1';
    // Remove on video removal
    const mo = new MutationObserver(() => {
      if (!document.contains(video) || !document.contains(badge)) {
        badge.remove();
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Observe new videos
  const observer = new MutationObserver(() => {
    const v = findBestVideo();
    if (v) ensureOverlay(v);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  setTimeout(() => {
    const v = findBestVideo();
    if (v) ensureOverlay(v);
  }, 1500);

  // Listen for background asking for playing video
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'PV_GET_VIDEO') {
      const v = findBestVideo();
      let src = v ? (v.currentSrc || v.src || '') : '';
      if (!src && v) {
        const s = v.querySelector('source[src]');
        if (s) src = s.getAttribute('src') || '';
      }
      if (!src || src.startsWith('blob:')) src = location.href;
      sendResponse({ url: src || location.href });
      return true;
    }
  });
})();
