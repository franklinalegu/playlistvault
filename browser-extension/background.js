const MENU_ID = 'playlistvault-download';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Download with PlaylistVault', contexts: ['page', 'link', 'video'] });
});

chrome.action.onClicked.addListener((tab) => { if (tab.url) handoff(tab.url); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url;
  if (url) handoff(url);
});

function handoff(url) {
  if (!/^https?:\/\//i.test(url) || url.length > 8192) return;
  const target = `playlistvault://add?url=${encodeURIComponent(url)}`;
  chrome.tabs.create({ url: target, active: false }).then((tab) => {
    if (tab.id !== undefined) setTimeout(() => chrome.tabs.remove(tab.id), 1000);
  }).catch(() => undefined);
}
