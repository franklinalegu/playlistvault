/**
 * /download — always serves the newest platform installer.
 *
 * A static redirect can't do this: the artifact name embeds the version
 * (PlaylistVault-2.0.8-x64.exe), so the URL changes with every release. This
 * function asks the GitHub API which release is current and forwards to that
 * asset, meaning the download link never needs editing again.
 *
 * It also keeps the origin private. Visitors only ever see /download on our own
 * domain, and if the binary later moves to R2 or B2 only DOWNLOAD_URL changes.
 *
 * Resolution order:
 *   1. R2_PUBLIC_URL  - preferred. Points at the stable PlaylistVault-Setup.exe
 *                       alias the release workflow republishes each version, so
 *                       no lookup is needed and nothing breaks when the repo
 *                       goes private.
 *   2. DOWNLOAD_URL   - manual override for any other host.
 *   3. GitHub API     - resolves the newest release asset by name.
 *   4. FALLBACK       - last known build, so the button is never dead.
 *
 * Environment variables (all optional):
 *   R2_PUBLIC_URL - e.g. https://dl.playlistvault.app  (no trailing slash)
 *   DOWNLOAD_URL  - hard override for a single fixed URL
 *   GITHUB_TOKEN  - read access; REQUIRED once the repo is private
 *   GITHUB_REPO   - defaults to franklinalegu/playlistvault
 */

// Stable object name the release workflow always overwrites.
const R2_INSTALLER = 'PlaylistVault-Setup.exe';

const REPO = process.env.GITHUB_REPO || 'franklinalegu/playlistvault';

// Last known-good build, used only if the API is unreachable so the button
// degrades to "slightly stale" rather than "broken".
const FALLBACK =
  'https://github.com/franklinalegu/playlistvault/releases/download/v5.1.0/PlaylistVault-5.1.0-x64.exe';
const FALLBACK_MAC = 'https://github.com/franklinalegu/playlistvault/releases/latest';

/** Pick the Windows installer from a release's assets. */
function findInstaller(assets) {
  if (!Array.isArray(assets)) return null;

  // Prefer the NSIS installer; explicitly avoid the portable build, the
  // blockmap and latest.yml, which all sit alongside it.
  const isInstaller = (a) =>
    /\.exe$/i.test(a.name) &&
    !/portable/i.test(a.name) &&
    !/\.blockmap$/i.test(a.name);

  return assets.find(isInstaller) || null;
}

function requestedPlatform(req) {
  const explicit = req.query?.platform;
  if (explicit === 'mac' || explicit === 'win') return explicit;
  return /Macintosh|Mac OS X/i.test(req.headers?.['user-agent'] ?? '') ? 'mac' : 'win';
}

function requestedMacArch(req) {
  const explicit = req.query?.arch;
  if (explicit === 'arm64' || explicit === 'x64') return explicit;
  const clientHint = req.headers?.['sec-ch-ua-arch'];
  return /arm/i.test(clientHint ?? '') ? 'arm64' : 'x64';
}

function requestedFormat(req) {
  const format = req.query?.format;
  return format === 'zip' || format === 'portable' ? format : 'dmg';
}

function findWindowsInstaller(assets, format) {
  if (!Array.isArray(assets)) return null;
  if (format === 'portable') {
    return assets.find((asset) => /portable.*\.exe$/i.test(asset.name)) || null;
  }
  return findInstaller(assets);
}

function findMacInstaller(assets, arch, format) {
  if (!Array.isArray(assets)) return null;
  return assets.find((asset) => new RegExp(`-${arch}\\.${format}$`, 'i').test(asset.name)) || null;
}

export default async function handler(req, res) {
  const platform = requestedPlatform(req);
  const macArch = platform === 'mac' ? requestedMacArch(req) : null;
  const format = requestedFormat(req);
  const hasExplicitMacTarget = platform === 'mac' && (req.query?.arch || req.query?.format);
  // R2 first: a stable URL that already points at the newest build, so there
  // is no API call, no rate limit and no dependency on repo visibility.
  if (process.env.R2_PUBLIC_URL) {
    const base = process.env.R2_PUBLIC_URL.replace(/\/+$/, '');
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (platform === 'win' && format !== 'portable') {
      res.redirect(302, `${base}/${R2_INSTALLER}`);
      return;
    }
    if (platform === 'mac' && !hasExplicitMacTarget && process.env.R2_MAC_URL) {
      res.redirect(302, process.env.R2_MAC_URL);
      return;
    }
  }

  // A manual override wins over the GitHub lookup below.
  const manualUrl = platform === 'mac'
    ? (process.env.DOWNLOAD_MAC_URL || process.env.DOWNLOAD_URL)
    : process.env.DOWNLOAD_URL;
  if (manualUrl && !hasExplicitMacTarget) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(302, manualUrl);
    return;
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'playlistvault-site'
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const api = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers,
      // Vercel caches at the edge; this keeps the lookup cheap without
      // pinning a stale version for long.
      next: { revalidate: 300 }
    });

    if (!api.ok) throw new Error(`GitHub API returned ${api.status}`);

    const release = await api.json();
    const asset = platform === 'mac'
      ? findMacInstaller(release.assets, macArch, format)
      : findWindowsInstaller(release.assets, format);
    if (!asset) throw new Error('No installer asset in the latest release');

    // With a token the browser can't follow browser_download_url directly on a
    // private repo, so stream through the authenticated API URL instead.
    const target = process.env.GITHUB_TOKEN
      ? asset.url
      : asset.browser_download_url;

    if (process.env.GITHUB_TOKEN) {
      // Proxy the bytes: the asset URL needs an Authorization header the
      // browser will not send.
      const bin = await fetch(target, {
        headers: { ...headers, Accept: 'application/octet-stream' },
        redirect: 'follow'
      });
      if (!bin.ok) throw new Error(`Asset fetch returned ${bin.status}`);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${asset.name}"`);
      if (bin.headers.get('content-length')) {
        res.setHeader('Content-Length', bin.headers.get('content-length'));
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      const buf = Buffer.from(await bin.arrayBuffer());
      res.status(200).send(buf);
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(302, target);
  } catch (error) {
    // Never leave the user staring at an error page — send them the last
    // build we know exists and record why.
    console.error('[download] falling back:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, platform === 'mac' ? FALLBACK_MAC : FALLBACK);
  }
}
