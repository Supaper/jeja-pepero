from collector.adapters.thelifechurch import TheLifeChurchAdapter

# 실제 게시판 마크업 패턴을 본뜬 픽스처 (네트워크 없이 parse만 검증)
SAMPLE = """
<html><body><ul>
  <li class="mdDefaultW100 mdWebzineconA">
    <div class="mdWebzineSbj"><a href="/main/sub.html?boardID=www56&amp;Mode=view&amp;no=101">큐티나눔 2월 10일</a></div>
    <span class="date">등록일 : 2026.02.10</span>
  </li>
  <li class="mdDefaultW100 mdWebzineconA">
    <div class="mdWebzineSbj"><a href="/main/sub.html?boardID=www56&amp;Mode=view&amp;no=100">[공지] 2월 일정 안내</a></div>
    <span class="date">등록일 : 2026.02.05</span>
  </li>
  <li class="mdDefaultW100 mdWebzineconA">
    <div class="mdWebzineSbj"><a href="/main/sub.html?boardID=www56&amp;Mode=view&amp;no=050">큐티나눔 1월 20일</a></div>
    <span class="date">등록일 : 2026.01.20</span>
  </li>
</ul></body></html>
"""


def make_adapter():
    return TheLifeChurchAdapter(
        base_url="http://www.thelifechurch.kr/main/sub.html?boardID=www56&Mode=list&keyfield=name&key=",
        domain="http://www.thelifechurch.kr",
    )


def test_parse_extracts_all_articles():
    posts = make_adapter().parse(SAMPLE, "홍길동")
    assert len(posts) == 3


def test_parse_fields():
    first = make_adapter().parse(SAMPLE, "홍길동")[0]
    assert first.title == "큐티나눔 2월 10일"
    assert first.posted_date == "2026.02.10"
    assert first.author == "홍길동"
    # &amp; 가 & 로 복원되고 도메인이 붙는다
    assert first.url == "http://www.thelifechurch.kr/main/sub.html?boardID=www56&Mode=view&no=101"


def test_post_key_is_stable_and_rtdb_safe():
    post = make_adapter().parse(SAMPLE, "홍길동")[0]
    key = post.post_key
    assert key == post.post_key  # 멱등
    assert all(ch not in key for ch in ".#$[]/")  # RTDB 키 제약 위반 없음
