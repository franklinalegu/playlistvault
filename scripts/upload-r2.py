#!/usr/bin/env python3
"""
Publish a release build to Cloudflare R2.

Called by the release workflow after electron-builder produces the installer.
Uploads three objects:

  PlaylistVault-<version>-x64.exe   the versioned build (permanent archive)
  PlaylistVault-Setup.exe           stable alias the download button points at
  latest.yml                        feed the in-app updater reads

The stable alias is the important one: it means the website never needs to
know the current version number. R2 has no server-side "copy on write" alias,
so we upload the same bytes twice — at ~95 MB that costs nothing on R2's free
egress and keeps the download URL permanently valid.

Environment:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
  UPLOAD_EXE      path to the installer
  UPLOAD_YML      path to latest.yml (optional)
  UPLOAD_VERSION  tag name, e.g. v2.1.0
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import (
        ClientError,
        EndpointConnectionError,
        SSLError,
    )
except ImportError:
    sys.exit("boto3 is required: pip install boto3")


def env(name: str, required: bool = True) -> str:
    value = os.environ.get(name, "").strip()
    if required and not value:
        sys.exit(f"Missing required environment variable: {name}")
    return value


def human(size: int) -> str:
    return f"{size / 1024 / 1024:.1f} MB"


def main() -> int:
    account = env("R2_ACCOUNT_ID")
    bucket = env("R2_BUCKET")
    version = env("UPLOAD_VERSION", required=False) or "unversioned"

    exe_path = Path(env("UPLOAD_EXE"))
    if not exe_path.is_file():
        sys.exit(f"Installer not found: {exe_path}")

    yml_raw = os.environ.get("UPLOAD_YML", "").strip()
    yml_path = Path(yml_raw) if yml_raw else None

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=env("R2_SECRET_ACCESS_KEY"),
        # R2 speaks S3 but only supports the 'auto' region.
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )

    def upload(path: Path, key: str, content_type: str, cache: str) -> None:
        size = path.stat().st_size
        print(f"  uploading {key} ({human(size)}) …", flush=True)
        with path.open("rb") as fh:
            client.upload_fileobj(
                fh,
                bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": cache,
                    "ContentDisposition": f'attachment; filename="{Path(key).name}"',
                    "Metadata": {"version": version},
                },
            )
        print(f"    done: {key}")

    try:
        # 1. Versioned copy — never overwritten, so old releases stay reachable.
        upload(
            exe_path,
            exe_path.name,
            "application/octet-stream",
            "public, max-age=31536000, immutable",
        )

        # 2. Stable alias the site links to. Short cache so a new release goes
        #    live quickly rather than being pinned at the edge for a year.
        upload(
            exe_path,
            "PlaylistVault-Setup.exe",
            "application/octet-stream",
            "public, max-age=300",
        )

        # 3. Updater feed. Must not be cached hard or clients miss new versions.
        if yml_path and yml_path.is_file():
            upload(yml_path, "latest.yml", "text/yaml", "public, max-age=60")
        else:
            print("  latest.yml not found — skipping (auto-update will not see this build)")

    except (EndpointConnectionError, SSLError) as exc:
        # A wrong account ID produces a hostname that doesn't resolve or fails
        # TLS, so surface it as a config problem rather than a stack trace.
        sys.exit(
            f"Could not reach R2 at {account}.r2.cloudflarestorage.com — "
            f"check R2_ACCOUNT_ID and network access. ({type(exc).__name__})"
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "unknown")
        if code in {"InvalidAccessKeyId", "SignatureDoesNotMatch"}:
            sys.exit("R2 rejected the credentials. Check the access key and secret.")
        if code == "NoSuchBucket":
            sys.exit(f"Bucket '{bucket}' does not exist. Create it, or fix R2_BUCKET.")
        sys.exit(f"R2 upload failed ({code}): {exc}")

    print(f"\nPublished {version} to R2 bucket '{bucket}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
