# Hosting downloads on Cloudflare R2

Why R2: **free egress**. A 95 MB installer downloaded 1,000 times is ~95 GB of
transfer, which costs nothing on R2 but would be billable almost anywhere else.
It also decouples downloads from GitHub, so the button keeps working when the
repository goes private.

Everything in the codebase is already wired. These are the account-side steps
only you can perform.

---

## 1. Create the bucket

1. Cloudflare dashboard → **R2** → **Create bucket**
2. Name it `playlistvault` (any name works — you'll set it as a secret)
3. Location: **Automatic**

## 2. Expose it publicly

A bucket is private by default; downloads need a public URL.

**With your own domain (recommended)**

R2 → your bucket → **Settings** → **Public access** → **Connect domain** →
enter `dl.playlistvault.app` (or any subdomain you control on Cloudflare).

**Without a domain**

Enable the **r2.dev** development URL on the same page. It works, but
Cloudflare rate-limits it and advises against production use.

Note the resulting base URL — you'll need it in step 4.

## 3. Create an API token

R2 → **Manage R2 API Tokens** → **Create API token**

- Permissions: **Object Read & Write**
- Scope: the `playlistvault` bucket only

Copy the three values shown — the secret is displayed **once**:

| Value | Used as |
| --- | --- |
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |
| Account ID (top-right of the R2 page) | `R2_ACCOUNT_ID` |

## 4. Add the secrets

**GitHub** → repo → Settings → Secrets and variables → **Actions**:

```
R2_ACCOUNT_ID         your Cloudflare account ID
R2_ACCESS_KEY_ID      from step 3
R2_SECRET_ACCESS_KEY  from step 3
R2_BUCKET             playlistvault
```

**Vercel** → project → Settings → **Environment Variables**:

```
R2_PUBLIC_URL         https://dl.playlistvault.app     (no trailing slash)
```

## 5. Cut a release

```bash
npm version patch && git push --follow-tags
```

The workflow builds the installer and uploads three objects:

| Object | Purpose | Cache |
| --- | --- | --- |
| `PlaylistVault-<version>-x64.exe` | Permanent versioned archive | 1 year, immutable |
| `PlaylistVault-Setup.exe` | Stable alias the website links to | 5 minutes |
| `latest.yml` | Feed the in-app updater reads | 1 minute |

The stable alias is the point of the design: `/download` never needs editing,
because the workflow republishes that same object every release.

---

## How `/download` resolves

`api/download.js` tries each source in order and stops at the first that works:

1. **`R2_PUBLIC_URL`** — redirect to the stable alias. No API call, no rate
   limit, unaffected by repo visibility.
2. **`DOWNLOAD_URL`** — manual override for any other host.
3. **GitHub API** — looks up the newest release asset by name.
4. **Hardcoded fallback** — the last known build, so the button is never dead.

Visitors only ever see `yourdomain.com/download`, whichever path is taken.

## Verifying it worked

```bash
curl -sSI https://yourdomain.com/download | head -3
# expect: HTTP/2 302  +  location: https://dl.playlistvault.app/PlaylistVault-Setup.exe

curl -sSI https://dl.playlistvault.app/PlaylistVault-Setup.exe | head -3
# expect: HTTP/2 200  +  content-length: ~99000000
```

## Costs

R2's free tier covers 10 GB of storage and 1 million writes per month, with
**no egress charges**. At ~95 MB per release that's roughly 100 releases stored
free, and downloads are unlimited. Realistically this stays at zero.

## Troubleshooting

**Upload step is skipped** — the `if:` guard requires `R2_ACCESS_KEY_ID`; the
secret is missing or misnamed. This is intentional, so a build never fails just
because R2 isn't configured.

**"Bucket does not exist"** — `R2_BUCKET` doesn't match the bucket name, or the
token is scoped to a different bucket.

**"Could not reach R2"** — `R2_ACCOUNT_ID` is wrong. It's the account ID from
the R2 overview page, not the bucket name or a zone ID.

**Download 404s** — public access isn't enabled on the bucket, or
`R2_PUBLIC_URL` points somewhere else. Test the R2 URL directly before blaming
the site.

**Auto-update finds nothing** — `latest.yml` didn't upload. Check the workflow
log; electron-builder only emits it for NSIS targets.
