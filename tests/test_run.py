from collector.adapters.base import Adapter
from collector.config import AppConfig
from collector.main import run
from collector.models import Post
from collector.notifier.base import Notifier
from collector.store.memory import MemoryStore

RAW_POSTS = [
    {"posted_date": "2026.02.10", "title": "큐티나눔 2월 10일", "url": "http://x/101"},
    {"posted_date": "2026.02.05", "title": "[공지] 2월 일정 안내", "url": "http://x/100"},
    {"posted_date": "2026.01.20", "title": "큐티나눔 1월 20일", "url": "http://x/050"},  # start_date 이전
]


class FakeAdapter(Adapter):
    """네트워크 없이 고정 글 목록을 돌려주는 어댑터."""

    def fetch(self, author):
        return ""

    def parse(self, html, author):
        return [
            Post(source="s", author=author, posted_date=r["posted_date"], title=r["title"], url=r["url"])
            for r in RAW_POSTS
        ]


class CapturingNotifier(Notifier):
    def __init__(self):
        self.last = None

    def notify_daily(self, posts):
        self.last = posts


def make_cfg():
    return AppConfig(
        source={},
        collection={"start_date": "2026.02.01", "request_delay_seconds": 0},
        authors=["홍길동"],
        categories=[
            {"name": "공지(제외)", "exclude": True, "keywords": ["공지"]},
            {"name": "QT", "keywords": ["큐티나눔"]},
        ],
        default_category="기타",
        firebase={},
    )


def test_run_filters_categorizes_and_dedupes():
    cfg = make_cfg()
    store = MemoryStore()
    notifier = CapturingNotifier()

    new = run(cfg, store, notifier, adapter=FakeAdapter())

    # 공지 제외 + 1월 글(start_date 이전) 제외 → 큐티나눔 2월 글 1건만 신규
    assert len(new) == 1
    assert new[0].title == "큐티나눔 2월 10일"
    assert new[0].category == "QT"
    assert new[0].collected_at is not None
    assert notifier.last == new


def test_run_is_idempotent():
    cfg = make_cfg()
    store = MemoryStore()
    notifier = CapturingNotifier()

    first = run(cfg, store, notifier, adapter=FakeAdapter())
    second = run(cfg, store, notifier, adapter=FakeAdapter())  # 재실행

    assert len(first) == 1
    assert len(second) == 0  # 이미 저장된 글은 다시 알리지 않는다
    assert len(store.data) == 1
