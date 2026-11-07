# [LAYER: PLUMBING]
"""Stateless slug and string normalization primitives (Python)."""


def normalize_slug(raw_text: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in raw_text.strip())
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-")

