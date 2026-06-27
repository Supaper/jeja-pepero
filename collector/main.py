"""수집 배치 진입점.

실행:
  python -m collector.main --config config/config.yaml          # RTDB에 기록
  python -m collector.main --config config/config.yaml --dry-run # 저장 안 함(콘솔만)

장애 격리: 한 작성자 수집 실패는 로그만 남기고 다음 작성자로 진행한다.
"""
from __future__ import annotations

import argparse
import datetime
import logging
import os
from typing import List, Optional

from .adapters.base import Adapter
from .adapters.thelifechurch import TheLifeChurchAdapter
from .categorizer import Categorizer
from .config import AppConfig
from .models import Post
from .notifier.base import Notifier
from .notifier.console import ConsoleNotifier
from .store.base import Store
from .store.memory import MemoryStore

log = logging.getLogger("collector")

ADAPTERS = {"thelifechurch": TheLifeChurchAdapter}


def build_adapter(cfg: AppConfig) -> Adapter:
    src = cfg.source
    col = cfg.collection
    name = src.get("adapter", "thelifechurch")
    if name not in ADAPTERS:
        raise ValueError(f"알 수 없는 adapter: {name}")
    return ADAPTERS[name](
        base_url=src["base_url"],
        domain=src["domain"],
        source_name=src.get("name", name),
        user_agent=col.get("user_agent", "jeja-pepero-monitor/0.1"),
    )


def build_store(cfg: AppConfig, dry_run: bool) -> Store:
    if dry_run:
        return MemoryStore()
    from .store.rtdb import RealtimeDatabaseStore

    return RealtimeDatabaseStore(
        database_url=cfg.firebase["database_url"],
        credentials_path=os.environ.get("FIREBASE_CREDENTIALS")
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
    )


def run(
    cfg: AppConfig,
    store: Store,
    notifier: Notifier,
    *,
    adapter: Optional[Adapter] = None,
) -> List[Post]:
    """수집 → 필터/분류 → 신규 저장 → 알림. 새로 저장된 글 목록을 반환."""
    adapter = adapter or build_adapter(cfg)
    categorizer = Categorizer.from_config(cfg.categories, cfg.default_category)
    start_date = cfg.collection.get("start_date", "0000.00.00")
    delay = float(cfg.collection.get("request_delay_seconds", 1.0))
    now_iso = datetime.datetime.now().isoformat(timespec="seconds")

    all_new: List[Post] = []
    for author in cfg.authors:
        try:
            html = adapter.fetch(author)
            kept: List[Post] = []
            for post in adapter.parse(html, author):
                if post.posted_date < start_date:
                    continue
                category = categorizer.categorize(post.title)
                if category is None:  # 제외 규칙(예: 공지)
                    continue
                post.category = category
                post.collected_at = now_iso
                kept.append(post)
            new_posts = store.save_new(kept)
            all_new.extend(new_posts)
            log.info("%s: 대상 %d건, 신규 %d건", author, len(kept), len(new_posts))
        except Exception as e:  # noqa: BLE001 - 작성자 단위 장애 격리
            log.exception("%s 처리 실패: %s", author, e)
        finally:
            if delay > 0:
                import time

                time.sleep(delay)

    notifier.notify_daily(all_new)
    return all_new


def main() -> None:
    parser = argparse.ArgumentParser(description="게시판 모니터링 수집기")
    parser.add_argument("--config", default="config/config.yaml", help="설정 파일 경로")
    parser.add_argument("--dry-run", action="store_true", help="저장하지 않고 콘솔 출력만")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    cfg = AppConfig.load(args.config)
    store = build_store(cfg, args.dry_run)
    notifier = ConsoleNotifier()  # 카카오 연동은 추후 교체
    new_posts = run(cfg, store, notifier)
    log.info("완료: 신규 %d건%s", len(new_posts), " (dry-run)" if args.dry_run else "")


if __name__ == "__main__":
    main()
