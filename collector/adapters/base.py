"""어댑터 인터페이스."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from ..models import Post


class Adapter(ABC):
    @abstractmethod
    def fetch(self, author: str) -> str:
        """작성자명으로 게시판을 조회해 HTML 원문을 반환."""

    @abstractmethod
    def parse(self, html: str, author: str) -> List[Post]:
        """HTML에서 글 목록을 추출. (날짜 필터/분류는 호출부에서 수행)"""
