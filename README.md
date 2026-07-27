# PlaylistVault

Built by **Franklin Alegu (FA)**.

A modern Windows desktop app for downloading YouTube playlists for offline viewing — built with Electron, React, TypeScript, Vite and Tailwind CSS, powered by `yt-dlp` and FFmpeg.

> **Responsible use.** PlaylistVault is intended for archiving content you own, content published under a licence that permits redistribution, or content you have explicit permission to save. Downloading copyrighted material without authorisation may breach YouTube's Terms of Service and the copyright law where you live. You are responsible for how you use this software.

---

## Features

| Area | What you get |
| --- | --- |
| **Analysis** | Paste a playlist, video or `youtu.be` link. Flat extraction reads even 1000+ item playlists in about a second, with title, creator, thumbnail, per-video duration and a size estimate. |
| **Selection** | Per-video checkboxes, live filter, select all / clear. Private, deleted and members-only videos are detected and locked out with a reason. |
| **Formats** | Quality from 360p to 4K or "best", MP4 / MKV / WebM containers, and audio-only extraction to MP3, M4A, Opus, FLAC or WAV. |
| **Queue** | Multiple playlists, drag-to-reorder, per-job pause / resume / cancel / retry, and per-video retry. Bounded parallelism at both the job and video level. |
| **Progress** | Live percentage, transfer speed and ETA per video and per job, throttled so huge playlists don't flood the UI. |
| **Organisation** | Zero-padded numbering that sorts correctly in Explorer, sanitised filenames, optional per-playlist folders, and duplicate skipping so re-running a playlist only fetches what's missing. |
| **Resource links** *(v2)* | Each playlist gets `_Resource Links.html` — an offline, clickable index of every video's source URL, channel, thumbnail, chapters and description links, tiled row-by-row against the exact file saved to disk. Searchable, with a copy-all-URLs button. A JSON companion is written for scripting. |
| **Destination control** *(v2)* | Pick any folder per download, with your six most recent folders offered as one-click shortcuts. |
| **History** | Searchable record with favourites, one-click "open folder", and CSV export. Optional automatic pruning. |
| **Settings** | Theme (dark / light / follow Windows), six accent colours, default folder and format, concurrency, notifications, clipboard monitoring, update preferences. |
| **Nice-to-haves** | Native Windows notifications, clipboard monitoring, drag-and-drop a link onto the window, `Ctrl+Enter` to start, embedded thumbnails/metadata, subtitle download. |

---

## Requirements

- **Node.js 18+** and npm
- **Windows 10/11** to produce the `.exe` (the app itself also runs on macOS/Linux for development)
- `yt-dlp` and `ffmpeg` — fetched automatically, see below

## Getting started

```bash
npm install          # install dependencies
npm run fetch:binaries   # download yt-dlp + FFmpeg into resources/bin
npm run dev          # launch the app with hot reload
```

`fetch:binaries` pulls the latest `yt-dlp.exe` and an FFmpeg essentials build into `resources/bin/`, which is bundled into the installer so the shipped app is fully self-contained. Pass `--force` to re-download. If it fails (corporate proxy, etc.) you can drop `yt-dlp.exe`, `ffmpeg.exe` and `ffprobe.exe` into `resources/bin/` yourself, or point Settings → Dependencies at an existing install.

The app searches for binaries in this order: an explicit path from Settings → the bundled `resources/bin` → `~/.playlistvault/bin` → your system `PATH`.

## Building the Windows app

```bash
npm run dist            # NSIS installer + portable .exe  -> release/1.0.0/
npm run dist:portable   # portable .exe only
npm run pack            # unpacked directory (fast, for smoke testing)
```

The installer lets the user choose the install directory, creates desktop and Start Menu shortcuts, registers an uninstall entry, and supports auto-update via `electron-updater` (configure the `publish` block in `package.json` to point at your own release host).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server + Electron with HMR |
| `npm run build` | Typecheck, then build renderer, main and preload |
| `npm run typecheck` | `tsc --noEmit` across both app and Node configs |
| `npm test` | Run the Vitest suite (45 tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint over `.ts` / `.tsx` |
| `npm run fetch:binaries` | Download yt-dlp + FFmpeg (add `--no-ffmpeg` for yt-dlp only) |
| `npm run dist` | Package the Windows installer and portable build |

---

## Architecture

```
PlaylistVault/
├── electron/
│   ├── main/            # App lifecycle, window, IPC, updater, clipboard watcher
│   └── preload/         # contextBridge — the only renderer↔main surface
├── backend/             # Pure Node services (no Electron imports where avoidable)
│   ├── download/        # Queue manager, yt-dlp spawn wrapper, format + progress parsing
│   ├── manifest/        # Description-link extraction and the HTML/JSON resource index
│   ├── playlist/        # Metadata analyzer
│   ├── ffmpeg/          # Binary discovery and version probing
│   ├── storage/         # Atomic JSON store, history service
│   ├── settings/        # Settings service with validation
│   └── util/            # Filename sanitising, path guards, URL validation
├── shared/              # Types, IPC channel names and formatters used by all layers
├── src/                 # React renderer
│   ├── pages/           # Home, Downloads, History, Settings, About
│   ├── components/      # Sidebar, TitleBar, JobCard, PlaylistPanel, OptionsPanel, ui primitives
│   ├── contexts/        # Settings, Queue, Toast providers
│   ├── hooks/           # useAnalyzer
│   └── styles/          # Tailwind layers + glassmorphism components
├── tests/               # Vitest unit tests
└── resources/           # Icons and bundled binaries
```

**Process model.** The renderer never touches Node. It calls a frozen `window.vault` API exposed through `contextBridge`; every IPC handler is wrapped so it returns a typed `{ ok: true, data } | { ok: false, error }` result instead of throwing across the boundary. Downloads run as child processes in the main process, and progress is streamed back over IPC and throttled to ~4 updates/second per job.

**Data.** Settings and history live in `%APPDATA%/PlaylistVault/` as JSON, written atomically (temp file + rename) so a crash mid-write can't corrupt them.

### Security

The threat model here is that video titles, playlist names and URLs are all attacker-controlled strings that end up near a process spawn and the file system.

- **No shell, ever.** `yt-dlp` is spawned with `shell: false` and an explicit `argv` array, so nothing in a title or path can be interpreted as a command.
- **URL allow-listing.** Only `http(s)` URLs on known YouTube hosts are accepted; IDs are regex-validated and the URL is rebuilt from scratch before use.
- **Filename sanitising.** Illegal characters and control codes are stripped, whitespace collapsed, trailing dots/spaces removed, reserved device names (`CON`, `NUL`, `COM1`…) escaped, and length capped.
- **Path containment.** `resolveWithin` rejects any path that escapes the destination folder, and protected system roots (`C:\Windows`, `/etc`, …) are refused as destinations.
- **Renderer hardening.** `contextIsolation: true`, `nodeIntegration: false`, a strict CSP, external links forced out to the default browser, and in-app navigation blocked.

### Testing

74 unit tests cover the security-critical and parsing-critical code — filename sanitising, path traversal, destination guards, URL parsing, yt-dlp argv construction, progress-line parsing, formatters, description-link extraction, manifest HTML escaping (including `javascript:`/`data:` URL rejection), and settings migration from v1.

```bash
npm test
```

Beyond the unit suite, the pipeline was verified end-to-end against live YouTube content: playlist analysis (19 videos in ~0.9s), a full download with merge to MP4, duplicate skipping, cancel mid-flight, and pause/resume continuing from 27% to completion.

---

## Troubleshooting

**"yt-dlp was not found"** — Run `npm run fetch:binaries`, or set an explicit path in Settings → Dependencies. The Settings page shows the detected version of each binary.

**Downloads fail with "Sign in to confirm you're not a bot"** — YouTube is throttling the connection. Lower the parallel-downloads slider, wait a few minutes, and update yt-dlp (`npm run fetch:binaries -- --force`); it changes frequently to keep up with YouTube.

**Merging fails** — Check FFmpeg in Settings → Dependencies. MP4 output with the `avc1 + m4a` selector avoids re-encoding; if a source only offers VP9/AV1, try the MKV container.

**Nothing happens on a `/watch?v=…&list=…` link** — That's treated as a playlist by design. Strip the `list=` parameter to download the single video.

---

## Releasing

Tagged pushes build and publish the Windows installer automatically via GitHub Actions:

```bash
npm version patch && git push --follow-tags
```

See [RELEASING.md](RELEASING.md) for the full process, test builds, and code-signing setup.

## Licence

MIT © 2026 Franklin Alegu (FA). Application source only. `yt-dlp` (Unlicense) and FFmpeg (LGPL/GPL) are separate projects with their own licences and are downloaded at build time rather than vendored.
