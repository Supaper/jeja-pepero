"""게시판 모니터링 수집기 패키지.

흐름: adapters(fetch+parse) → categorizer(분류/제외) → store(RTDB) → notifier(알림).
설정은 config/config.yaml, 시크릿(서비스계정 키 등)은 환경변수로 주입한다.
"""
__all__ = []
