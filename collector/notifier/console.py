"""콘솔 알림 — 카카오 연동 전까지 사용하는 기본 구현.

신규 글을 작성자별로 묶어 표준출력에 요약한다.
(추후 KakaoMemoNotifier 가 같은 Notifier 인터페이스로 대체/추가된다)
"""
from __future__ import annotations

from collections import defaultdict
from typing import List

from ..models import Post
from .base import Notifier


class ConsoleNotifier(Notifier):
    def notify_daily(self, posts: List[Post]) -> None:
        if not posts:
            print("[일별] 신규 글 없음")
            return

        print(f"[일별] 신규 {len(posts)}건")
        by_author = defaultdict(list)
        for p in posts:
            by_author[p.author].append(p)

        for author, items in by_author.items():
            print(f"- {author} ({len(items)}건)")
            for p in items:
                print(f"    ({p.posted_date}) [{p.category}] {p.title}")
                print(f"      {p.url}")
