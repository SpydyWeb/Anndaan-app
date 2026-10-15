"""File uploads. Types are decided by content (magic bytes), never by the client's name or
MIME header. Photos are re-encoded, which strips EXIF (including GPS) and anything hidden."""

import io
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps

from ..config import get_settings
from ..errors import AppError

Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard


def _root() -> Path:
    p = Path(get_settings().upload_dir).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


async def _read_limited(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise AppError(413, "file_too_large", f"Files must be {get_settings().max_upload_mb} MB or smaller.")
    if not data:
        raise AppError(422, "file_empty", "The file is empty.")
    return data


def _sniff(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:12] in (b"ftypheic", b"ftypheix", b"ftypmif1"):
        return "image/heic"
    return None


def _reencode(data: bytes, max_side: int) -> tuple[bytes, int, int]:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        raise AppError(422, "invalid_image", "This image could not be read. Use a JPEG or PNG photo.")
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=82, optimize=True)
    return out.getvalue(), img.width, img.height


def _store(subdir: str, data: bytes, ext: str) -> str:
    rel = f"{subdir}/{uuid.uuid4().hex}.{ext}"
    target = _root() / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return rel


async def save_food_photo(file: UploadFile) -> tuple[str, int, int]:
    data = await _read_limited(file)
    if _sniff(data) not in ("image/jpeg", "image/png", "image/webp"):
        raise AppError(415, "unsupported_file", "Use a JPEG, PNG or WebP photo.")
    jpg, w, h = _reencode(data, 1600)
    return _store("food", jpg, "jpg"), w, h


async def save_certificate(file: UploadFile) -> tuple[str, str]:
    data = await _read_limited(file)
    kind = _sniff(data)
    if kind == "application/pdf":
        return _store("certificates", data, "pdf"), kind
    if kind in ("image/jpeg", "image/png", "image/webp"):
        jpg, _, _ = _reencode(data, 2400)
        return _store("certificates", jpg, "jpg"), "image/jpeg"
    raise AppError(415, "unsupported_file", "Upload a PDF or a photo (JPEG/PNG).")


def resolve(rel: str) -> Path:
    root = _root()
    path = (root / rel).resolve()
    if root not in path.parents or not path.is_file():
        raise AppError(404, "not_found", "File not found.")
    return path


def delete(rel: str | None) -> None:
    if not rel:
        return
    try:
        resolve(rel).unlink(missing_ok=True)
    except AppError:
        pass
