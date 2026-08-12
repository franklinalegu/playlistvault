# Releasing PlaylistVault

Releases are built by GitHub Actions on Windows and macOS runners — no Wine, no local build environment, and the same result every time.

## Cutting a release

```bash
npm version patch     # 2.0.1 -> 2.0.2   (bug fixes)
npm version minor     # 2.0.1 -> 2.1.0   (new features)
npm version major     # 2.0.1 -> 3.0.0   (breaking changes)

git push --follow-tags
```

`npm version` bumps `package.json`, commits, and creates a matching `v*` tag. Pushing the tag triggers the **Release** workflow, which:

1. Installs dependencies and runs typecheck + tests — **a failing test aborts the release**
2. Downloads the current `yt-dlp.exe` to bundle
3. Verifies the tag matches `package.json` (a mismatch fails the build rather than shipping a mislabelled installer)
4. Builds the NSIS installer with `electron-builder`
5. Publishes a GitHub Release with the installers, updater metadata (`latest.yml` / `latest-mac.yml`) and blockmaps

The release must be published, not draft, before installed apps can discover it. The app downloads updates in the background and installs them when the user restarts or quits the app.

## Why `latest.yml` matters

The in-app updater reads `latest.yml` on Windows and `latest-mac.yml` on macOS from the newest published release. Without the matching metadata file, update checks silently find nothing. The workflow attaches them automatically; just don't delete them when editing the release.

`.blockmap` enables delta updates — clients download only the changed portion rather than the full 95 MB.

## Test builds without releasing

Actions → **Release** → **Run workflow**. This builds the installer and uploads it as a workflow artifact (kept 14 days) **without** creating a release. Useful for checking a build before committing to a version number.

## Installer size

The workflow bundles the platform-matched yt-dlp, Node.js, and FFmpeg binaries for each target architecture. This makes the packaged app self-contained but increases installer size.

To bundle FFmpeg instead — larger installer, no first-run download — drop `--no-ffmpeg` from the workflow. Note the GitHub Release asset limit is 2 GB, so either approach is fine.

## Continuous integration

The **CI** workflow runs on every push and PR to `main`: typecheck, lint, tests, and a renderer build on Ubuntu. It skips Electron's postinstall (`--ignore-scripts`) since none of those checks need the Electron binary, which keeps it fast.

## Code signing

Windows builds are unsigned unless a certificate is configured, so Windows SmartScreen may warn on first run. macOS automatic updates require signed and notarized applications. Add these repository secrets; the workflow uses them when present:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.pfx` certificate |
| `CSC_KEY_PASSWORD` | Certificate password |
| `CSC_LINK_MAC` | Base64-encoded Apple Developer ID `.p12` certificate |
| `CSC_KEY_PASSWORD_MAC` | Apple certificate password |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

```bash
base64 -w 0 certificate.pfx    # paste the output as CSC_LINK
```

Never commit the `.pfx` itself — `.gitignore` already blocks `*.pfx` and `*.p12`.

## Troubleshooting

**"Tag v2.0.2 does not match package.json version 2.0.1"** — you tagged manually without bumping. Delete the tag, run `npm version`, and push again:

```bash
git tag -d v2.0.2 && git push origin :refs/tags/v2.0.2
```

**Release published but the app won't update** — check the matching metadata file (`latest.yml` on Windows or `latest-mac.yml` on macOS) is attached, the release is *published* rather than draft, and the version is genuinely higher than what's installed. macOS automatic updates also require a valid Apple signing identity and notarization setup.

**Build fails on `npm ci`** — `package-lock.json` is out of sync. Run `npm install` locally and commit the updated lockfile.
