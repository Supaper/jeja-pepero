"""규칙 기반 카테고리 분류기.

- 규칙은 순서대로 평가, 첫 매칭 적용.
- exclude=True 규칙에 매칭되면 None 반환 → 호출부에서 글을 버린다(예: 공지).
- 어떤 규칙에도 매칭 안 되면 default_category 반환.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class CategoryRule:
    name: str
    keywords: List[str] = field(default_factory=list)   # 부분 문자열 포함 매칭
    patterns: List[str] = field(default_factory=list)    # 정규식 매칭
    exclude: bool = False

    def matches(self, title: str) -> bool:
        if any(kw in title for kw in self.keywords):
            return True
        return any(re.search(p, title) for p in self.patterns)


class Categorizer:
    def __init__(self, rules: List[CategoryRule], default_category: str = "기타"):
        self.rules = rules
        self.default_category = default_category

    def categorize(self, title: str) -> Optional[str]:
        """카테고리명 반환. 제외 규칙에 걸리면 None."""
        for rule in self.rules:
            if rule.matches(title):
                return None if rule.exclude else rule.name
        return self.default_category

    @classmethod
    def from_config(cls, rules_cfg: list, default_category: str = "기타") -> "Categorizer":
        rules = [
            CategoryRule(
                name=r.get("name", ""),
                keywords=r.get("keywords", []) or [],
                patterns=r.get("patterns", []) or [],
                exclude=r.get("exclude", False),
            )
            for r in (rules_cfg or [])
        ]
        return cls(rules, default_category)
