"""thelifechurch.kr (boardID=www56) 어댑터.

기존 Apps Script(monitorDailyCollectionOnly)의 파싱 동작을 그대로 옮긴 것:
- 글 블록을 'class="mdDefaultW100 mdWebzinecon' 기준으로 분리
- 각 블록에서 제목/링크(mdWebzineSbj 영역의 <a>)와 '등록일 : YYYY.MM.DD' 추출
- 제목은 태그 제거 + 공백 정리, 링크의 &amp;는 & 로 복원
(공지 제외/날짜 필터/중복 제거는 분류기·저장소·main이 담당)
"""
from __future__ import annotations

import html as html_lib
import re
import time
from typing import List
from urllib.parse import quote

from ..models import Post
from .base import Adapter

ARTICLE_SPLIT = 'class="mdDefaultW100 mdWebzinecon'
LINK_RE = re.compile(r'mdWebzineSbj"[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>')
DATE_RE = re.compile(r"등록일\s*:\s*(\d{4}\.\d{2}\.\d{2})")
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


class TheLifeChurchAdapter(Adapter):
    def __init__(
        self,
        base_url: str,
        domain: str,
        source_name: str = "thelifechurch-www56",
        user_agent: str = "jeja-pepero-monitor/0.1",
        timeout: int = 15,
        retries: int = 3,
    ):
        self.base_url = base_url
        self.domain = domain
        self.source_name = source_name
        self.user_agent = user_agent
        self.timeout = timeout
        self.retries = retries

    def fetch(self, author: str) -> str:
        import requests  # 지연 import: 테스트(parse만)에서는 불필요

        url = self.base_url + quote(author)
        last_exc = None
        for attempt in range(self.retries):
            try:
                resp = requests.get(
                    url, headers={"User-Agent": self.user_agent}, timeout=self.timeout
                )
                resp.raise_for_status()
                # 대상 사이트 인코딩 자동 감지(EUC-KR 가능성)
                if resp.apparent_encoding:
                    resp.encoding = resp.apparent_encoding
                return resp.text
            except Exception as e:  # noqa: BLE001 - 재시도 후 마지막에 raise
                last_exc = e
                time.sleep(2 ** attempt)  # backoff: 1s, 2s, 4s
        raise last_exc  # type: ignore[misc]

    def parse(self, html: str, author: str) -> List[Post]:
        posts: List[Post] = []
        for chunk in html.split(ARTICLE_SPLIT)[1:]:
            m = LINK_RE.search(chunk)
            if not m:
                continue
            rel_link, raw_title = m.group(1), m.group(2)
            title = WS_RE.sub(" ", TAG_RE.sub("", raw_title)).strip()
            title = html_lib.unescape(title)
            dm = DATE_RE.search(chunk)
            posted_date = dm.group(1) if dm else "0000.00.00"
            url = self.domain + rel_link.replace("&amp;", "&")
            posts.append(
                Post(
                    source=self.source_name,
                    author=author,
                    posted_date=posted_date,
                    title=title,
                    url=url,
                )
            )
        return posts
