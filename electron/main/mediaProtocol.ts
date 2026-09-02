import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export function registerMediaProtocol(): void {
  // vault-media://<encodeURIComponent(absolutePath)> → file:// stream
  // Privileged, bypasses webSecurity for local playback only
  if (protocol.isProtocolHandled('vault-media')) return;
  protocol.handle('vault-media', async (req) => {
    try {
      // req.url is like vault-media://C%3A%5CUsers%5C...%5Cvideo.mp4
      const raw = req.url.slice('vault-media://'.length);
      const decoded = decodeURIComponent(raw.split('?')[0].split('#')[0].split('&')[0]);
      // On some platforms the URL parser may treat the path as host, so raw is correct
      const filePath = decoded;
      // Basic safety: must be absolute and exist
      if (!path.isAbsolute(filePath)) return new Response('Not found', { status: 404 });
      if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 });
      // Only serve known media extensions
      const ext = path.extname(filePath).toLowerCase();
      const allowed = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.mp3', '.m4a', '.opus', '.flac', '.wav']);
      if (!allowed.has(ext)) return new Response('Forbidden', { status: 403 });
      const fileUrl = pathToFileURL(filePath).toString();
      return net.fetch(fileUrl);
    } catch (e) {
      return new Response(String(e instanceof Error ? e.message : e), { status: 500 });
    }
  });
}
