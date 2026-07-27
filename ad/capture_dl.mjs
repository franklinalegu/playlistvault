/**
 * Captures a REAL download in flight: analyses a short Creative Commons
 * video, starts the job, and screenshots the Downloads page repeatedly so the
 * advertorial can show genuine moving progress bars, speeds and ETAs.
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/home/user/PlaylistVault/ad/frames_dl';
fs.mkdirSync(OUT, { recursive: true });
const LOG = '/home/user/PlaylistVault/ad/capture_dl.log';
fs.writeFileSync(LOG, '');
const log = (m) => fs.appendFileSync(LOG, m + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('uncaughtException', (e) => log('UNCAUGHT ' + (e?.stack || e)));

async function shot(win, name) {
  fs.writeFileSync(path.join(OUT, name + '.png'), (await win.webContents.capturePage()).toPNG());
}

import('/home/user/PlaylistVault/dist-electron/main/index.js')
  .then(() => app.whenReady())
  .then(async () => {
    await wait(4500);
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) { log('NO WINDOW'); return app.exit(1); }
    win.setSize(1920, 1080);
    await wait(1200);

    // Queue a real download straight through the IPC API.
    const started = await win.webContents.executeJavaScript(`(async () => {
      const a = await window.vault.playlist.analyze({
        url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', quality: '360p'
      });
      if (!a.ok) return { ok:false, error:a.error };
      const s = await window.vault.settings.get();
      const r = await window.vault.queue.start({
        playlist: a.data,
        selectedVideoIds: a.data.videos.map(v => v.id),
        destination: s.data.defaultDestination,
        options: { ...s.data.defaultOptions, quality: '360p', concurrency: 1, skipDuplicates: false }
      });
      return { ok: r.ok, error: r.error, title: a.data.title };
    })()`);
    log('start -> ' + JSON.stringify(started));

    await win.webContents.executeJavaScript(`window.location.hash='/downloads'`);
    await wait(1200);

    // Burst-capture the live progress.
    for (let i = 0; i < 46; i++) {
      await shot(win, 'dl_' + String(i).padStart(3, '0'));
      await wait(420);
    }

    // Expanded per-video detail view.
    await win.webContents.executeJavaScript(`
      (() => { const b=[...document.querySelectorAll('button')].find(x=>/Details/.test(x.textContent)); if(b) b.click(); })()
    `);
    await wait(1000);
    for (let i = 0; i < 10; i++) {
      await shot(win, 'exp_' + String(i).padStart(3, '0'));
      await wait(420);
    }

    // Let it finish, then capture the completed state + history.
    for (let i = 0; i < 40; i++) {
      const done = await win.webContents.executeJavaScript(`
        /completed/i.test(document.body.innerText)
      `);
      if (done) break;
      await wait(700);
    }
    await wait(1200);
    await shot(win, 'dl_complete');

    await win.webContents.executeJavaScript(`window.location.hash='/history'`);
    await wait(1800);
    await shot(win, 'history_filled');

    log('DONE');
    app.exit(0);
  })
  .catch((e) => { log('ERR ' + (e?.stack || e)); app.exit(1); });
