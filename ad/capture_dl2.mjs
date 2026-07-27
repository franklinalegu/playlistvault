/**
 * Captures the Downloads UI with a genuinely running job.
 *
 * YouTube blocks this datacenter IP, so instead of faking the UI we point the
 * real DownloadManager at a local HTTP server serving real video files. Every
 * progress bar, speed figure and status transition on screen is produced by
 * the actual production code path (yt-dlp -> progress parser -> IPC -> React).
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const OUT = '/home/user/PlaylistVault/ad/frames_dl';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const LOG = '/home/user/PlaylistVault/ad/capture_dl.log';
fs.writeFileSync(LOG, '');
const log = (m) => fs.appendFileSync(LOG, m + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('uncaughtException', (e) => log('UNCAUGHT ' + (e?.stack || e)));

const CLIP = '/tmp/vsrv/clip.mp4';
const TITLES = [
  'Cinematic Landscapes — Volume One',
  'Studio Session: Late Night Keys',
  'Deep Focus — Ambient Works',
  'Field Recordings: Coastal Mornings',
  'Analog Textures & Tape Loops',
  'Northern Lights — Timelapse Reel'
];

/** Serve the same clip under several names, throttled so progress is visible. */
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const stat = fs.statSync(CLIP);
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': stat.size });
      const stream = fs.createReadStream(CLIP, { highWaterMark: 64 * 1024 });
      // Throttle to ~1.5 MB/s so the UI shows real, readable movement.
      stream.on('data', (chunk) => {
        stream.pause();
        setTimeout(() => stream.resume(), 42);
        res.write(chunk);
      });
      stream.on('end', () => res.end());
      req.on('close', () => stream.destroy());
    });
    server.listen(8771, '127.0.0.1', () => resolve(server));
  });
}

async function shot(win, name) {
  fs.writeFileSync(path.join(OUT, name + '.png'), (await win.webContents.capturePage()).toPNG());
}

const server = await startServer();
log('server up on :8771');

import('/home/user/PlaylistVault/dist-electron/main/index.js')
  .then(() => app.whenReady())
  .then(async () => {
    await wait(4500);
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) { log('NO WINDOW'); return app.exit(1); }
    win.setSize(1920, 1080);
    await wait(1000);

    // Build a playlist object pointing at the local server and hand it to the
    // real queue API — the same call the Home page makes.
    const payload = {
      videos: TITLES.map((t, i) => ({
        id: 'local' + i,
        title: t,
        durationSeconds: 40,
        url: `http://127.0.0.1:8771/${i}.mp4`,
        index: i + 1,
        isAvailable: true
      }))
    };

    const started = await win.webContents.executeJavaScript(`(async () => {
      const p = ${JSON.stringify(payload)};
      const s = await window.vault.settings.get();
      const playlist = {
        id: 'demo', title: 'Creator Archive — Season 3', creator: 'Aurora Studio',
        videoCount: p.videos.length, totalDurationSeconds: 240, estimatedBytes: 92000000,
        videos: p.videos, sourceUrl: 'http://127.0.0.1:8771/', fetchedAt: new Date().toISOString()
      };
      const r = await window.vault.queue.start({
        playlist,
        selectedVideoIds: p.videos.map(v => v.id),
        destination: s.data.defaultDestination,
        options: { ...s.data.defaultOptions, quality: 'best', concurrency: 2,
                   skipDuplicates: false, embedThumbnail: false, numberFiles: true }
      });
      return { ok: r.ok, error: r.error };
    })()`);
    log('start -> ' + JSON.stringify(started));

    await win.webContents.executeJavaScript(`window.location.hash='/downloads'`);
    await wait(1500);

    // Expand the job so per-video rows are visible during capture.
    await win.webContents.executeJavaScript(`
      (() => { const b=[...document.querySelectorAll('button')].find(x=>/Details/.test(x.textContent)); if(b) b.click(); })()
    `);
    await wait(600);

    for (let i = 0; i < 70; i++) {
      await shot(win, 'dl_' + String(i).padStart(3, '0'));
      await wait(380);
    }

    await shot(win, 'dl_complete');
    await win.webContents.executeJavaScript(`window.location.hash='/history'`);
    await wait(2000);
    await shot(win, 'history_filled');

    log('DONE');
    server.close();
    app.exit(0);
  })
  .catch((e) => { log('ERR ' + (e?.stack || e)); server.close(); app.exit(1); });
