#!/usr/bin/env python3
"""Prepare local WebP derivatives and update the venue asset manifest.

Usage:
  python scripts/prepare-venue-images.py SOURCE_DIRECTORY [REPOSITORY_ROOT]

The source directory must contain one subdirectory per photoFolder. Original
files are never copied into the repository. The generated manifest keeps the
former ImageKit URL as remoteUrl for a one-shot browser fallback.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageOps


ASSET_PREFIX = "window.NN_VENUE_ASSETS = "
GROUPS = ("inter", "food", "exter", "other")


def safe_stem(filename: str) -> str:
    stem = Path(filename).stem.lower()
    value = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return value or "image"


def fit_cover(image: Image.Image, width: int, height: int) -> Image.Image:
    if image.width < width or image.height < height:
        ratio = min(image.width / width, image.height / height, 1)
        width = max(1, round(width * ratio))
        height = max(1, round(height * ratio))
    return ImageOps.fit(image, (width, height), method=Image.Resampling.LANCZOS)


def proportional(image: Image.Image, longest: int) -> Image.Image:
    result = image.copy()
    if max(result.size) > longest:
        result.thumbnail((longest, longest), Image.Resampling.LANCZOS)
    return result


def save_webp(image: Image.Image, target: Path, quality: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=quality, method=6, exact=False)


def read_asset_manifest(data_file: Path) -> tuple[str, dict, str]:
    source = data_file.read_text(encoding="utf-8")
    start = source.index(ASSET_PREFIX) + len(ASSET_PREFIX)
    end = source.index(";", start)
    return source[:start], json.loads(source[start:end]), source[end:]


def write_asset_manifest(data_file: Path, prefix: str, manifest: dict, suffix: str) -> None:
    serialized = json.dumps(manifest, ensure_ascii=False, indent=2)
    data_file.write_text(f"{prefix}{serialized}{suffix}", encoding="utf-8")


def source_lookup(folder: Path) -> dict[str, Path]:
    return {path.name.casefold(): path for path in folder.iterdir() if path.is_file()}


def process_image(source: Path, target_root: Path, output_stem: str, cover: bool) -> dict[str, str]:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        gallery = proportional(image, 1600)
        thumb = proportional(image, 240)
        gallery_path = target_root / "gallery" / f"{output_stem}.webp"
        thumb_path = target_root / "thumbs" / f"{output_stem}.webp"
        save_webp(gallery, gallery_path, 81)
        save_webp(thumb, thumb_path, 69)

        result = {
            "url": gallery_path.as_posix(),
            "thumbUrl": thumb_path.as_posix(),
        }
        if cover:
            cover_320 = target_root / "cover-320.webp"
            cover_640 = target_root / "cover-640.webp"
            save_webp(fit_cover(image, 320, 240), cover_320, 76)
            save_webp(fit_cover(image, 640, 480), cover_640, 79)
            result["src320"] = cover_320.as_posix()
            result["src640"] = cover_640.as_posix()
        return result


def relative_url(path: str, repository_root: Path) -> str:
    return f"./{Path(path).relative_to(repository_root).as_posix()}"


def migrate(source_root: Path, repository_root: Path) -> tuple[int, int]:
    data_file = repository_root / "venue-cards-data.js"
    prefix, manifest, suffix = read_asset_manifest(data_file)
    output_root = repository_root / "assets" / "venues"
    if output_root.exists():
        shutil.rmtree(output_root)

    generated = 0
    migrated_sources = 0
    missing: list[str] = []

    for folder_name, folder_manifest in manifest.get("folders", {}).items():
        source_folder = source_root / folder_name
        if not source_folder.is_dir():
            missing.append(folder_name)
            continue
        lookup = source_lookup(source_folder)
        target_root = output_root / folder_name

        entries: list[tuple[str, dict]] = []
        if folder_manifest.get("cover"):
            entries.append(("cover", folder_manifest["cover"]))
        for group in GROUPS:
            entries.extend((group, item) for item in folder_manifest.get(group, []))

        used_names: set[str] = set()
        for group, entry in entries:
            source = lookup.get(str(entry.get("file", "")).casefold())
            if source is None:
                raise FileNotFoundError(f"Missing source file for {folder_name}: {entry.get('file')}")
            stem = safe_stem(source.name)
            candidate = stem
            counter = 2
            while candidate in used_names:
                candidate = f"{stem}-{counter}"
                counter += 1
            used_names.add(candidate)

            paths = process_image(source, target_root, candidate, group == "cover")
            remote_url = entry.get("remoteUrl") or entry.get("url") or ""
            entry.clear()
            entry.update({
                "file": source.name,
                "url": relative_url(paths["url"], repository_root),
                "thumbUrl": relative_url(paths["thumbUrl"], repository_root),
                "remoteUrl": remote_url,
            })
            if group == "cover":
                entry["src320"] = relative_url(paths["src320"], repository_root)
                entry["src640"] = relative_url(paths["src640"], repository_root)
                generated += 2
            generated += 2
            migrated_sources += 1

    if missing:
        raise FileNotFoundError("Missing photo folders: " + ", ".join(missing))

    manifest["source"] = "Local WebP with ImageKit fallback"
    manifest["localBaseUrl"] = "./assets/venues"
    manifest["generatedFrom"] = source_root.name
    write_asset_manifest(data_file, prefix, manifest, suffix)
    return migrated_sources, generated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_directory", type=Path)
    parser.add_argument("repository_root", nargs="?", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    source_root = args.source_directory.expanduser().resolve()
    repository_root = args.repository_root.expanduser().resolve()
    migrated, generated = migrate(source_root, repository_root)
    print(f"Processed {migrated} source images; generated {generated} WebP files.")


if __name__ == "__main__":
    main()
