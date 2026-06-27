"""YAML 설정 로더. 시크릿은 설정 파일이 아닌 환경변수로 주입한다."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class AppConfig:
    source: Dict[str, Any] = field(default_factory=dict)
    collection: Dict[str, Any] = field(default_factory=dict)
    authors: List[str] = field(default_factory=list)
    categories: List[Dict[str, Any]] = field(default_factory=list)
    default_category: str = "기타"
    firebase: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def load(cls, path: str) -> "AppConfig":
        import yaml  # 지연 import (테스트가 yaml 없이도 import 되도록)

        with open(path, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        return cls(
            source=raw.get("source", {}) or {},
            collection=raw.get("collection", {}) or {},
            authors=raw.get("authors", []) or [],
            categories=raw.get("categories", []) or [],
            default_category=raw.get("default_category", "기타"),
            firebase=raw.get("firebase", {}) or {},
        )
