const MENU_ID = 'playlistvault-download';
const MENU_ID_VIDEO = 'playlistvault-video';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Download page with PlaylistVault', contexts: ['page', 'link'] });
  chrome.contextMenus.create({ id: MENU_ID_VIDEO, title: 'Download this video with PlaylistVault', contexts: ['video'] });
});

// Toolbar click: try to capture the currently PLAYING video first, fallback to page URL
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  const videoUrl = await getPlayingVideoUrl(tab.id).catch(() => null);
  handoff(videoUrl || tab.url, 'toolbar');
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_ID_VIDEO) {
    // Video context: prefer srcUrl (the <video> source), then playing video
    const src = info.srcUrl || await getPlayingVideoUrl(tab?.id).catch(() => null);
    if (src) handoff(src, 'video-context');
    else if (info.pageUrl) handoff(info.pageUrl, 'page');
    return;
  }
  // Page/link context
  const url = info.linkUrl || info.pageUrl || tab?.url;
  if (url) {
    // If page has a playing video, prefer that
    const videoUrl = tab?.id ? await getPlayingVideoUrl(tab.id).catch(() => null) : null;
    handoff(videoUrl || url, 'page');
  }
});

// Ask content script for the currently playing video's src
async function getPlayingVideoUrl(tabId) {
  if (!tabId) return null;
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: findPlayingVideo
  }).catch(() => []);
  // Pick first non-empty from any frame, prefer not blob: if we have a real URL
  let blobFallback = null;
  for (const r of results) {
    const url = r?.result;
    if (!url) continue;
    if (url.startsWith('blob:')) { blobFallback = url; continue; }
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  }
  // If only blob: try to find page URL as last resort for yt-dlp
  return blobFallback || null;
}

function findPlayingVideo() {
  // Runs in page context — extract best video source being played
  const videos = Array.from(document.querySelectorAll('video'));
  if (videos.length === 0) return null;
  // Prefer currently playing
  const playing = videos.filter(v => !v.paused && !v.ended && v.readyState > 0 && (v.currentSrc || v.src));
  const candidates = playing.length ? playing : videos;
  // Score: playing + visible + largest size + has src
  candidates.sort((a, b) => {
    const aScore = (a.currentSrc || a.src ? 10 : 0) + (a.videoWidth * a.videoHeight / 100000) + (!a.paused ? 5 : 0);
    const bScore = (b.currentSrc || b.src ? 10 : 0) + (b.videoWidth * b.videoHeight / 100000) + (!b.paused ? 5 : 0);
    return bScore - aScore;
  });
  for (const v of candidates) {
    let src = v.currentSrc || v.src || '';
    // Check <source> children
    if (!src) {
      const s = v.querySelector('source[src]');
      if (s) src = s.getAttribute('src') || '';
    }
    // Try to find m3u8/mp4 in page HTML if video is blob (YouTube uses blob)
    if (!src || src.startsWith('blob:')) {
      // For YouTube, the page URL itself is what yt-dlp wants — return page URL
      if (location.href.includes('youtube.com') || location.href.includes('youtu.be')) return location.href;
      if (src.startsWith('blob:')) return src; // fallback
    }
    if (src) return src;
  }
  // Direct video file page
  if (document.contentType && document.contentType.startsWith('video/')) return location.href;
  return null;
}

function handoff(url, source) {
  if (!url || typeof url !== 'string') return;
  if (url.startsWith('blob:')) {
    // Blob URLs are not downloadable directly — fall back to page URL which yt-dlp can handle
    // Try to get page URL from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const page = tabs[0]?.url;
      if (page && /^https?:\/\//i.test(page)) handoff(page, 'blob-fallback');
    });
    return;
  }
  if (!/^https?:\/\//i.test(url) || url.length > 8192) return;
  // Also accept data: for completeness? No, skip
  const target = `playlistvault://add?url=${encodeURIComponent(url)}&src=${encodeURIComponent(source || 'ext')}`;
  chrome.tabs.create({ url: target, active: false }).then((tab) => {
    if (tab.id !== undefined) setTimeout(() => chrome.tabs.remove(tab.id), 1000);
  }).catch(() => undefined);
}
