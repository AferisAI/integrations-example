import json
import os
from pathlib import Path
from typing import Any

TOKEN_FILE = Path(os.getenv("TOKEN_STORE_PATH", "") or str(Path(__file__).resolve().parents[2] / ".tokens.json"))


class PersistentTokenStore:
    """Armazenamento local persistente para desenvolvimento.

    O arquivo fica fora do Git e permite que a sessão OAuth sobreviva a
    reinicializações do servidor FastAPI durante ensaios manuais.
    """

    def __init__(self, path: Path = TOKEN_FILE) -> None:
        self.path = path

    def _read(self) -> dict[str, dict[str, Any]]:
        try:
            if not self.path.exists():
                return {}
            with self.path.open("r", encoding="utf-8") as file:
                data = json.load(file)
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _write(self, data: dict[str, dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self.path.with_suffix(".tmp")
        with temporary_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
        temporary_path.replace(self.path)

    def save(self, session_id: str, token: dict[str, Any]) -> None:
        data = self._read()
        data[session_id] = token
        self._write(data)

    def get(self, session_id: str | None) -> dict[str, Any] | None:
        if not session_id:
            return None
        return self._read().get(session_id)

    def delete(self, session_id: str | None) -> None:
        if not session_id:
            return
        data = self._read()
        if session_id in data:
            del data[session_id]
            self._write(data)


token_store = PersistentTokenStore()

InMemoryTokenStore = PersistentTokenStore
