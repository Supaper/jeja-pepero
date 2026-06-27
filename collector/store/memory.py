"""인메모리 저장소 — 테스트 및 --dry-run 용."""
from __future__ import annotations

from typing import Dict

from ..models import Post
from .base import Store


class MemoryStore(Store):
    def __init__(self) -> None:
        self.data: Dict[str, dict] = {}

    def has(self, post_key: str) -> bool:
        return post_key in self.data

    def save(self, post: Post) -> None:
        self.data[post.post_key] = post.to_record()
