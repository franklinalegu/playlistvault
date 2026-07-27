/**
 * Builds the per-playlist resource manifest: a self-contained, offline HTML
 * page listing every downloaded video alongside its source links.
 *
 * Each row is tiled against the actual file on disk — the exact filename is
 * shown and hyperlinked with a relative `file://` path, so clicking a row
 * opens the media that sits next to the manifest.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { VideoLinks } from './linkExtractor.js';

export interface ManifestMeta {
  playlistTitle: string;
  creator: string;
  sourceUrl: string;
  destination: string;
  generatedAt: string;
  quality: string;
  container: string;
  audioOnly: boolean;
}

/** HTML-escape. Every value below is untrusted (titles, descriptions, URLs). */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a value for use inside an href.
 *
 * Only http(s) survives — a `javascript:` or `data:` URL scraped from a
 * description must never become a clickable link in the manifest.
 */
function safeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return esc(url.toString());
  } catch {
    return null;
  }
}

/** Encode a local filename for a relative href without breaking on spaces. */
function fileHref(fileName: string | undefined): string | null {
  if (!fileName) return null;
  return esc(encodeURIComponent(fileName));
}

function fmtDuration(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return '—';
  const s = Math.floor(total % 60);
  const m = Math.floor((total / 60) % 60);
  const h = Math.floor(total / 3600);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtUploadDate(raw?: string): string {
  if (!raw || raw.length !== 8) return '';
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function renderRow(v: VideoLinks, index: number): string {
  const watch = safeHref(v.watchUrl);
  const channel = safeHref(v.channelUrl);
  const thumb = safeHref(v.thumbnailUrl);
  const local = fileHref(v.fileName);

  const links = v.descriptionLinks
    .map((l) => {
      const href = safeHref(l.url);
      if (!href) return '';
      const label = l.label ? esc(l.label) : esc(l.url);
      return `<li><a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>
                <span class="raw">${esc(l.url)}</span></li>`;
    })
    .filter(Boolean)
    .join('\n');

  const chapters = v.chapters
    .map((c) => {
      const href = safeHref(c.url);
      if (!href) return '';
      return `<li><a href="${href}" target="_blank" rel="noreferrer noopener">
                <span class="ts">${esc(fmtDuration(c.startSeconds))}</span> ${esc(c.title)}</a></li>`;
    })
    .filter(Boolean)
    .join('\n');

  const meta = [
    v.durationSeconds ? fmtDuration(v.durationSeconds) : '',
    fmtUploadDate(v.uploadDate),
    v.viewCount ? `${v.viewCount.toLocaleString()} views` : ''
  ].filter(Boolean).map(esc).join(' · ');

  return `
<article class="row" id="v${index}">
  <div class="num">${String(index).padStart(2, '0')}</div>
  <div class="thumb">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : '<div class="ph"></div>'}</div>
  <div class="body">
    <h2>${esc(v.title)}</h2>
    <p class="meta">${meta}${v.channelName ? ` · ${esc(v.channelName)}` : ''}</p>

    <div class="file">
      ${local
        ? `<a class="filelink" href="${local}">${esc(v.fileName)}</a>`
        : '<span class="missing">No file recorded</span>'}
    </div>

    <div class="primary">
      ${watch ? `<a class="pill" href="${watch}" target="_blank" rel="noreferrer noopener">Watch source</a>` : ''}
      ${channel ? `<a class="pill" href="${channel}" target="_blank" rel="noreferrer noopener">Channel</a>` : ''}
      ${thumb ? `<a class="pill" href="${thumb}" target="_blank" rel="noreferrer noopener">Thumbnail</a>` : ''}
    </div>

    ${chapters ? `<details><summary>Chapters (${v.chapters.length})</summary><ul class="chapters">${chapters}</ul></details>` : ''}
    ${links
      ? `<details open><summary>Links from description (${v.descriptionLinks.length})</summary><ul class="links">${links}</ul></details>`
      : '<p class="none">No links found in the description.</p>'}
    ${v.note ? `<p class="note">${esc(v.note)}</p>` : ''}
  </div>
</article>`;
}

export function buildManifestHtml(meta: ManifestMeta, videos: VideoLinks[]): string {
  const totalLinks = videos.reduce((n, v) => n + v.descriptionLinks.length, 0);
  const source = safeHref(meta.sourceUrl);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.playlistTitle)} — Resource links</title>
<style>
  :root { --accent:#4F46E5; --accent-lt:#818CF8; --bg:#0C0F1A; --card:rgba(255,255,255,.05);
          --line:rgba(255,255,255,.10); --text:#E6EAF5; --dim:#98A2BD; }
  * { box-sizing:border-box; }
  body { margin:0; padding:48px 24px 80px; background:var(--bg); color:var(--text);
         font:15px/1.6 Inter,"Segoe UI",system-ui,sans-serif;
         background-image:radial-gradient(circle at 12% 0%,rgba(79,70,229,.20),transparent 42%),
                          radial-gradient(circle at 88% 6%,rgba(14,165,233,.12),transparent 46%); }
  .wrap { max-width:1000px; margin:0 auto; }
  header { border-bottom:1px solid var(--line); padding-bottom:24px; margin-bottom:8px; }
  h1 { margin:0 0 6px; font-size:30px; letter-spacing:-.02em; }
  .sub { color:var(--dim); font-size:14px; }
  .stats { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px 14px; font-size:13px; }
  .stat b { display:block; font-size:19px; margin-bottom:1px; }
  .tools { margin:22px 0 6px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  #q { flex:1; min-width:240px; background:var(--card); border:1px solid var(--line); border-radius:10px;
       padding:10px 14px; color:var(--text); font:inherit; }
  #q:focus { outline:2px solid rgba(79,70,229,.5); outline-offset:1px; }
  .btn { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px;
         color:var(--text); font:inherit; cursor:pointer; }
  .btn:hover { border-color:var(--accent-lt); }
  .row { display:grid; grid-template-columns:44px 172px 1fr; gap:18px; align-items:start;
         padding:22px 0; border-bottom:1px solid var(--line); }
  .num { color:var(--dim); font-variant-numeric:tabular-nums; font-size:13px; padding-top:4px; text-align:right; }
  .thumb img,.ph { width:172px; aspect-ratio:16/9; object-fit:cover; border-radius:10px;
                   border:1px solid var(--line); display:block; background:#151A28; }
  h2 { margin:0 0 4px; font-size:17px; font-weight:600; letter-spacing:-.01em; }
  .meta { margin:0 0 10px; color:var(--dim); font-size:12.5px; }
  .file { margin-bottom:10px; }
  .filelink { display:inline-block; font-family:ui-monospace,Consolas,monospace; font-size:12.5px;
              background:rgba(79,70,229,.14); border:1px solid rgba(79,70,229,.30);
              color:#C7D2FE; padding:5px 10px; border-radius:8px; text-decoration:none;
              word-break:break-all; }
  .filelink:hover { background:rgba(79,70,229,.24); }
  .missing { color:#F0A0A0; font-size:12.5px; }
  .primary { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
  .pill { font-size:12.5px; text-decoration:none; color:var(--text); background:var(--card);
          border:1px solid var(--line); border-radius:999px; padding:5px 12px; }
  .pill:hover { border-color:var(--accent-lt); color:#fff; }
  details { margin-top:6px; }
  summary { cursor:pointer; color:var(--accent-lt); font-size:13px; font-weight:500; }
  ul { margin:10px 0 0; padding-left:18px; }
  li { margin-bottom:7px; font-size:13.5px; }
  a { color:#A5B4FC; }
  a:hover { color:#C7D2FE; }
  .raw { display:block; color:#6C7793; font-size:11.5px; word-break:break-all; }
  .ts { font-variant-numeric:tabular-nums; color:var(--dim); margin-right:6px; }
  .none,.note { color:var(--dim); font-size:12.5px; margin:8px 0 0; }
  .note { color:#E0B080; }
  footer { margin-top:36px; color:#6C7793; font-size:12px; text-align:center; line-height:1.8; }
  mark { background:rgba(79,70,229,.45); color:#fff; border-radius:3px; }
  @media (max-width:720px){ .row{grid-template-columns:32px 1fr;} .thumb{display:none;} }
  @media print { body{background:#fff;color:#000;} .tools{display:none;} a{color:#00c;} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${esc(meta.playlistTitle)}</h1>
    <p class="sub">
      ${esc(meta.creator)}${source ? ` · <a href="${source}" target="_blank" rel="noreferrer noopener">Open playlist</a>` : ''}
    </p>
    <div class="stats">
      <div class="stat"><b>${videos.length}</b>videos</div>
      <div class="stat"><b>${totalLinks}</b>links found</div>
      <div class="stat"><b>${esc(meta.audioOnly ? 'Audio' : meta.quality)}</b>${esc(meta.audioOnly ? 'extracted' : 'quality')}</div>
      <div class="stat"><b>${esc(meta.container.toUpperCase())}</b>format</div>
    </div>
  </header>

  <div class="tools">
    <input id="q" type="search" placeholder="Filter videos and links…" aria-label="Filter">
    <button class="btn" id="expand">Expand all</button>
    <button class="btn" id="collapse">Collapse all</button>
    <button class="btn" id="copy">Copy all URLs</button>
  </div>

  <main id="list">
${videos.map((v, i) => renderRow(v, i + 1)).join('\n')}
  </main>

  <footer>
    Generated by PlaylistVault on ${esc(new Date(meta.generatedAt).toLocaleString())}<br>
    Saved to ${esc(meta.destination)}<br>
    Links are reproduced from each video's public description. Respect the rights of the original creators.
  </footer>
</div>

<script>
  // Client-side filter: hides rows that don't match, and highlights hits.
  const q = document.getElementById('q');
  const rows = [...document.querySelectorAll('.row')];
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase();
    for (const row of rows) {
      const hit = !term || row.textContent.toLowerCase().includes(term);
      row.style.display = hit ? '' : 'none';
    }
  });

  document.getElementById('expand').onclick = () =>
    document.querySelectorAll('details').forEach(d => d.open = true);
  document.getElementById('collapse').onclick = () =>
    document.querySelectorAll('details').forEach(d => d.open = false);

  document.getElementById('copy').onclick = async () => {
    const urls = [...document.querySelectorAll('a[href^="http"]')].map(a => a.href);
    const unique = [...new Set(urls)].join('\\n');
    try {
      await navigator.clipboard.writeText(unique);
      const b = document.getElementById('copy');
      const old = b.textContent;
      b.textContent = 'Copied ' + [...new Set(urls)].length + ' URLs';
      setTimeout(() => (b.textContent = old), 1800);
    } catch {
      alert('Clipboard blocked by the browser. Use Ctrl+A then Ctrl+C.');
    }
  };
</script>
</body>
</html>`;
}

/** Machine-readable companion, for scripting and re-importing. */
export function buildManifestJson(meta: ManifestMeta, videos: VideoLinks[]): string {
  return JSON.stringify({ playlist: meta, videos }, null, 2);
}

export async function writeManifest(
  destination: string,
  meta: ManifestMeta,
  videos: VideoLinks[]
): Promise<{ htmlPath: string; jsonPath: string }> {
  await fsp.mkdir(destination, { recursive: true });
  const htmlPath = path.join(destination, '_Resource Links.html');
  const jsonPath = path.join(destination, '_Resource Links.json');
  await fsp.writeFile(htmlPath, buildManifestHtml(meta, videos), 'utf8');
  await fsp.writeFile(jsonPath, buildManifestJson(meta, videos), 'utf8');
  return { htmlPath, jsonPath };
}
