"""도메인 모델."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Post:
    """수집한 글 1건."""
    source: str
    author: str
    posted_date: str  # "YYYY.MM.DD" (게시판 표기 그대로, 문자열 비교로 정렬/필터)
    title: str
    url: str
    category: Optional[str] = None
    collected_at: Optional[str] = None

    @property
    def post_key(self) -> str:
        """dedupe 키. URL 우선, 없으면 author+date+title 해시.

        RTDB 키엔 '.', '#', '$', '[', ']', '/' 를 못 쓰므로 16진 해시로 안전하게 만든다.
        """
        basis = self.url or f"{self.author}|{self.posted_date}|{self.title}"
        return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:20]

    def to_record(self) -> dict:
        """RTDB 저장용 dict."""
        return {
            "source": self.source,
            "author": self.author,
            "posted_date": self.posted_date,
            "title": self.title,
            "url": self.url,
            "category": self.category,
            "collected_at": self.collected_at,
        }
