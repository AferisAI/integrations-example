from typing import Any


class InMemoryTokenStore:
    """Armazenamento simples para desenvolvimento local."""

    def __init__(self) -> None:
        self._tokens: dict[str, dict[str, Any]] = {}

    def save(self, session_id: str, token: dict[str, Any]) -> None:
        self._tokens[session_id] = token

    def get(self, session_id: str | None) -> dict[str, Any] | None:
        return self._tokens.get(session_id) if session_id else None

    def delete(self, session_id: str | None) -> None:
        if session_id:
            self._tokens.pop(session_id, None)


token_store = InMemoryTokenStore()
