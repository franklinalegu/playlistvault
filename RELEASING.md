# Releasing PlaylistVault

Releases are built by GitHub Actions on a real Windows runner — no Wine, no local build environment, and the same result every time.

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
5. Publishes a **draft** GitHub Release with the installer, `latest.yml` and `.blockmap`

Then go to **Releases**, review the draft, add notes, and click **Publish**.

Nothing goes out automatically — the draft step is deliberate, so a bad build can be deleted before anyone sees it.

## Why `latest.yml` matters

The in-app updater reads `latest.yml` from the newest published release. Without it, update checks silently find nothing. The workflow attaches it automatically; just don't delete it when editing the release.

`.blockmap` enables delta updates — clients download only the changed portion rather than the full 95 MB.

## Test builds without releasing

Actions → **Release** → **Run workflow**. This builds the installer and uploads it as a workflow artifact (kept 14 days) **without** creating a release. Useful for checking a build before committing to a version number.

## Installer size

The workflow runs `fetch-binaries.mjs --no-ffmpeg`, so only yt-dlp (~18 MB) is bundled and the installer stays around 95 MB. FFmpeg (~90 MB) is downloaded by the app on first run.

To bundle FFmpeg instead — larger installer, no first-run download — drop `--no-ffmpeg` from the workflow. Note the GitHub Release asset limit is 2 GB, so either approach is fine.

## Continuous integration

The **CI** workflow runs on every push and PR to `main`: typecheck, lint, tests, and a renderer build on Ubuntu. It skips Electron's postinstall (`--ignore-scripts`) since none of those checks need the Electron binary, which keeps it fast.

## Code signing

Builds are unsigned, so Windows SmartScreen warns on first run. To sign, add these repository secrets and the build picks them up automatically:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.pfx` certificate |
| `CSC_KEY_PASSWORD` | Certificate password |

```bash
base64 -w 0 certificate.pfx    # paste the output as CSC_LINK
```

Never commit the `.pfx` itself — `.gitignore` already blocks `*.pfx` and `*.p12`.

## Troubleshooting

**"Tag v2.0.2 does not match package.json version 2.0.1"** — you tagged manually without bumping. Delete the tag, run `npm version`, and push again:

```bash
git tag -d v2.0.2 && git push origin :refs/tags/v2.0.2
```

**Release published but the app won't update** — check `latest.yml` is attached, the release is *published* rather than draft, and the version is genuinely higher than what's installed.

**Build fails on `npm ci`** — `package-lock.json` is out of sync. Run `npm install` locally and commit the updated lockfile.
