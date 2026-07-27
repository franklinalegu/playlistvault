/**
 * Captures real UI frames from the built PlaylistVault app.
 *
 * Everything in the advertorial is genuine product footage: we drive the
 * renderer with seeded state via executeJavaScript, then screenshot at 1920x1080.
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/home/user/PlaylistVault/ad/frames';
fs.mkdirSync(OUT, { recursive: true });
const LOG = '/home/user/PlaylistVault/ad/capture.log';
fs.writeFileSync(LOG, '');
const log = (m) => fs.appendFileSync(LOG, m + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('uncaughtException', (e) => log('UNCAUGHT ' + (e?.stack || e)));

/** Fake playlist used purely so the UI has something rich to render. */
const SEED = `
(() => {
  const thumbs = [
    'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg'
  ];
  window.__adSeed = true;
})()
`;

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  log('shot ' + name);
}

import('/home/user/PlaylistVault/dist-electron/main/index.js')
  .then(() => app.whenReady())
  .then(async () => {
    await wait(4500);
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) { log('NO WINDOW'); return app.exit(1); }

    // Full HD capture surface.
    win.setSize(1920, 1080);
    win.setResizable(true);
    await wait(1200);
    await win.webContents.executeJavaScript(SEED);
    await wait(800);

    // --- Home, empty state ---
    await win.webContents.executeJavaScript(`window.location.hash='/'`);
    await wait(1600);
    await shot(win, 'home_empty');

    // --- Home with a URL typed in, character by character ---
    // Real key events keep React's state in sync and let us capture the
    // genuine focus/typing look rather than a synthetic value assignment.
    await win.webContents.executeJavaScript(`
      document.querySelector('input[aria-label="Playlist URL"]').focus()
    `);
    await wait(300);
    const URL_TEXT = 'https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb';
    let typedFrame = 0;
    for (let i = 0; i < URL_TEXT.length; i++) {
      win.webContents.sendInputEvent({ type: 'char', keyCode: URL_TEXT[i] });
      // Capture a few intermediate frames for a typing animation.
      if (i === 18 || i === 40) {
        await wait(60);
        await shot(win, 'home_typing_' + (typedFrame++));
      }
    }
    await wait(900);
    await shot(win, 'home_typed');

    // --- Real analysis of a real playlist ---
    await win.webContents.executeJavaScript(`
      document.querySelector('form button[type="submit"]').click()
    `);
    // Poll until the playlist panel renders.
    for (let i = 0; i < 60; i++) {
      await wait(500);
      const ready = await win.webContents.executeJavaScript(`
        !!document.body.innerText.match(/Select all/)
      `);
      if (ready) break;
    }
    await wait(1200);
    await shot(win, 'playlist_loaded');

    // Scroll the video list to show depth.
    await win.webContents.executeJavaScript(`
      document.querySelector('main').scrollTo({ top: 260, behavior: 'instant' })
    `);
    await wait(700);
    await shot(win, 'playlist_list');

    await win.webContents.executeJavaScript(`
      document.querySelector('main').scrollTo({ top: 720, behavior: 'instant' })
    `);
    await wait(700);
    await shot(win, 'options_panel');

    await win.webContents.executeJavaScript(`
      document.querySelector('main').scrollTo({ top: 0, behavior: 'instant' })
    `);
    await wait(600);

    // --- Downloads / History / Settings / About ---
    for (const [hash, name] of [
      ['/downloads', 'downloads_empty'],
      ['/history', 'history_empty'],
      ['/settings', 'settings'],
      ['/about', 'about']
    ]) {
      await win.webContents.executeJavaScript(`window.location.hash='${hash}'`);
      await wait(1600);
      await shot(win, name);
    }

    // --- Settings scrolled to dependencies ---
    await win.webContents.executeJavaScript(`window.location.hash='/settings'`);
    await wait(1400);
    await win.webContents.executeJavaScript(`
      document.querySelector('main').scrollTo({ top: 1400, behavior: 'instant' })
    `);
    await wait(900);
    await shot(win, 'settings_deps');

    // --- Accent colour variants, to show theming ---
    for (const [color, name] of [['#0EA5E9','accent_sky'], ['#10B981','accent_green'], ['#EC4899','accent_pink']]) {
      await win.webContents.executeJavaScript(`
        (async () => { await window.vault.settings.update({ accentColor: '${color}' }); })()
      `);
      await wait(1100);
      await shot(win, name);
    }
    // restore
    await win.webContents.executeJavaScript(`
      (async () => { await window.vault.settings.update({ accentColor: '#4F46E5' }); })()
    `);
    await wait(900);

    // --- Light theme ---
    await win.webContents.executeJavaScript(`
      (async () => { await window.vault.settings.update({ theme: 'light' }); })()
    `);
    await wait(1400);
    await shot(win, 'settings_light');
    await win.webContents.executeJavaScript(`
      (async () => { await window.vault.settings.update({ theme: 'dark' }); })()
    `);
    await wait(1200);

    log('DONE');
    app.exit(0);
  })
  .catch((e) => { log('ERR ' + (e?.stack || e)); app.exit(1); });
