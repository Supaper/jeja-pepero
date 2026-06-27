from collector.categorizer import Categorizer

RULES = [
    {"name": "공지(제외)", "exclude": True, "keywords": ["공지"]},
    {"name": "QT", "keywords": ["큐티나눔"]},
    {"name": "기도제목", "patterns": [r"기도\s*제목"]},
]


def make():
    return Categorizer.from_config(RULES, default_category="기타")


def test_exclude_returns_none():
    assert make().categorize("[공지] 2월 일정 안내") is None


def test_keyword_match():
    assert make().categorize("큐티나눔 2월 10일") == "QT"


def test_regex_match():
    assert make().categorize("이번주 기도 제목 나눕니다") == "기도제목"


def test_first_match_wins():
    # '공지'가 먼저라 큐티나눔이 함께 있어도 제외된다
    assert make().categorize("공지: 큐티나눔 일정") is None


def test_default_category():
    assert make().categorize("그냥 일상 글") == "기타"
