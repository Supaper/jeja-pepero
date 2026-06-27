"""알림 채널 인터페이스."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from ..models import Post


class Notifier(ABC):
    @abstractmethod
    def notify_daily(self, posts: List[Post]) -> None:
        """신규 수집 글을 일별 알림으로 발송."""
