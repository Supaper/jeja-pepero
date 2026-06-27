"""저장소 인터페이스. dedupe는 post_key 집합 기준(멱등)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from ..models import Post


class Store(ABC):
    @abstractmethod
    def has(self, post_key: str) -> bool:
        """이미 저장된 글인지."""

    @abstractmethod
    def save(self, post: Post) -> None:
        """글 저장(같은 post_key면 덮어써도 무방 — 멱등)."""

    def save_new(self, posts: List[Post]) -> List[Post]:
        """아직 없는 글만 저장하고, 새로 저장된 글 목록을 반환."""
        new_posts: List[Post] = []
        for post in posts:
            if not self.has(post.post_key):
                self.save(post)
                new_posts.append(post)
        return new_posts
