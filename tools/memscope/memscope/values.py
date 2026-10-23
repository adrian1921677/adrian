"""Value types the tool can read, plus parsing and formatting."""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ValueType:
    key: str
    label: str
    size: int
    fmt: str = ""
    dtype: str = ""
    is_float: bool = False
    is_text: bool = False
    encoding: str = ""

    @property
    def numeric(self) -> bool:
        return not self.is_text


TEXT_LEN = 32  # bytes read for text values in tables

TYPES: dict[str, ValueType] = {
    t.key: t
    for t in [
        ValueType("int32", "Ganzzahl (4 Byte)", 4, "<i", "<i4"),
        ValueType("float", "Kommazahl (float)", 4, "<f", "<f4", is_float=True),
        ValueType("double", "Kommazahl (double)", 8, "<d", "<f8", is_float=True),
        ValueType("int64", "Ganzzahl (8 Byte)", 8, "<q", "<i8"),
        ValueType("int16", "Ganzzahl (2 Byte)", 2, "<h", "<i2"),
        ValueType("byte", "Byte (1 Byte)", 1, "<B", "u1"),
        ValueType("utf8", "Text (UTF-8)", TEXT_LEN, is_text=True, encoding="utf-8"),
        ValueType("utf16", "Text (UTF-16)", TEXT_LEN * 2, is_text=True, encoding="utf-16-le"),
    ]
}

NUMERIC_KEYS = [k for k, t in TYPES.items() if t.numeric]


def get(key: str) -> ValueType:
    return TYPES.get(key, TYPES["int32"])


def parse_number(vt: ValueType, text: str) -> float | int:
    """Parse user input. Accepts '1,5' as well as '1.5', and 0x.. for integers."""
    t = text.strip().replace(" ", "")
    if not t:
        raise ValueError("Bitte einen Wert eingeben.")
    if vt.is_float:
        return float(t.replace(",", "."))
    if t.lower().startswith(("0x", "-0x")):
        return int(t, 16)
    return int(float(t.replace(",", "."))) if any(c in t for c in ".,eE") else int(t)


def decimals_in(text: str) -> int:
    t = text.strip().replace(",", ".")
    if "." not in t or "e" in t.lower():
        return 0
    return len(t.split(".", 1)[1])


def float_tolerance(text: str) -> float:
    """'Rounded' match like Cheat Engine: 12.5 matches 12.45 .. 12.55."""
    return 0.5 * 10 ** (-decimals_in(text))


def decode(vt: ValueType, data: bytes | None):
    if data is None:
        return None
    if vt.is_text:
        return decode_text(data, vt.encoding)
    return struct.unpack(vt.fmt, data[: vt.size])[0]


def decode_text(data: bytes, encoding: str) -> str:
    if encoding == "utf-16-le":
        end = 0
        while end + 1 < len(data) and data[end : end + 2] != b"\x00\x00":
            end += 2
        raw = data[:end]
    else:
        raw = data.split(b"\x00", 1)[0]
    return raw.decode(encoding, errors="replace")


def encode_text(text: str, encoding: str) -> bytes:
    return text.encode(encoding)


def format_value(vt: ValueType, value) -> str:
    if value is None:
        return "??"
    if vt.is_text:
        return value
    if vt.is_float:
        if math.isnan(value) or math.isinf(value):
            return str(value)
        if abs(value) >= 1e9 or (value != 0 and abs(value) < 1e-4):
            return f"{value:.4g}"
        return f"{value:.3f}".rstrip("0").rstrip(".") or "0"
    return str(value)


def np_dtype(vt: ValueType) -> np.dtype:
    return np.dtype(vt.dtype)


def looks_like_text(s: str) -> bool:
    return bool(s) and all(c.isprintable() for c in s) and "�" not in s
