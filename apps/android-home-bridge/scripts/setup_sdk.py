#!/usr/bin/env python3
"""Install the pinned Google Home Maven repository without committing SDK binaries."""
import hashlib
import tempfile
import urllib.request
import zipfile
from pathlib import Path

SDK_URL = "https://storage.googleapis.com/home_sdk_android/home.android.sdk_1_11_0.zip"
SDK_SHA256 = "5a75ecfffecdcf87c660c3a9c67924baa05466b1eaeb952e7219d29abaf98e04"
destination = Path(__file__).resolve().parents[1] / "sdk-repository"

with tempfile.TemporaryDirectory(prefix="waffled-home-sdk-") as temporary:
    archive = Path(temporary) / "sdk.zip"
    print("Downloading Google Home SDK 1.11.0…", flush=True)
    digest = hashlib.sha256()
    with urllib.request.urlopen(SDK_URL, timeout=60) as response, archive.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != SDK_SHA256:
        raise SystemExit("Google Home SDK checksum mismatch. No SDK files were installed.")
    with zipfile.ZipFile(archive) as contents:
        for entry in contents.infolist():
            target = (destination / entry.filename).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise SystemExit("Invalid SDK archive path.")
        contents.extractall(destination)
print(f"Google Home SDK installed in {destination}")
