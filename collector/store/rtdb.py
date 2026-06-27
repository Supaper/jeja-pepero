"""Firebase Realtime Database 저장소 (Admin SDK).

수집기는 Admin SDK로 보안 규칙을 우회해 posts/{post_key} 에 기록한다.
서비스계정 키는 환경변수(GOOGLE_APPLICATION_CREDENTIALS 또는 credentials_path)로 주입.
"""
from __future__ import annotations

from typing import Optional

from ..models import Post
from .base import Store


class RealtimeDatabaseStore(Store):
    def __init__(self, database_url: str, credentials_path: Optional[str] = None):
        import firebase_admin  # 지연 import: 테스트/드라이런에서는 불필요
        from firebase_admin import credentials, db

        if not firebase_admin._apps:
            cred = (
                credentials.Certificate(credentials_path)
                if credentials_path
                else credentials.ApplicationDefault()
            )
            firebase_admin.initialize_app(cred, {"databaseURL": database_url})
        self._db = db

    def has(self, post_key: str) -> bool:
        return self._db.reference(f"posts/{post_key}").get(shallow=True) is not None

    def save(self, post: Post) -> None:
        self._db.reference(f"posts/{post.post_key}").set(post.to_record())
