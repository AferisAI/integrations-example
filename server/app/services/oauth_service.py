import asyncio
import secrets
import time
from typing import Any

from authlib.integrations.starlette_client import OAuth as StarletteOAuth
from authlib.integrations.starlette_client.integration import StarletteIntegration
from fastapi import HTTPException
import httpx
from starlette.requests import Request

from app.core.settings import settings
from app.repositories.token_store import token_store


class InMemoryStateCache:
    """Armazenamento em memória para o estado temporário do OAuth.

    O cache evita que o callback dependa exclusivamente do cookie de sessão
    (que pode não ser enviado em alguns cenários de redirect cross-site),
    mantendo o mesmo valor ``state`` emitido no redirect inicial.
    """

    def __init__(self) -> None:
        self._values: dict[str, Any] = {}
        self._expires: dict[str, float] = {}

    async def get(self, key: str) -> Any | None:
        value = self._values.get(key)
        if value is None:
            return None
        expires_at = self._expires.get(key)
        if expires_at is not None and expires_at < time.time():
            self._values.pop(key, None)
            self._expires.pop(key, None)
            return None
        return value

    async def set(self, key: str, value: Any, expires_in: int | float | None = None) -> None:
        self._values[key] = value
        if expires_in:
            self._expires[key] = time.time() + float(expires_in)

    async def delete(self, key: str) -> None:
        self._values.pop(key, None)
        self._expires.pop(key, None)


class RobustStarletteIntegration(StarletteIntegration):
    """Permite recuperar o estado mesmo quando o cookie de sessão não chega."""

    async def get_state_data(self, session, state):  # type: ignore[override]
        key = f"_state_{self.name}_{state}"
        if self.cache is not None:
            try:
                cached = await self._get_cache_data(key)
            except Exception:  # pragma: no cover - defensive
                cached = None
            if cached:
                return cached.get("data")
        if session is not None:
            session_value = session.get(key)
            if session_value and isinstance(session_value, dict):
                # Com cache, a sessão guarda apenas o marcador de expiração.
                if "data" in session_value:
                    return session_value.get("data")
        return None


class OAuth(StarletteOAuth):
    framework_integration_cls = RobustStarletteIntegration


_state_cache = InMemoryStateCache()
oauth = OAuth(cache=_state_cache)

client_kwargs: dict[str, Any] = {
    "code_challenge_method": "S256",
    "token_endpoint_auth_method": settings.oauth_token_auth_method,
}
if settings.oauth_scope:
    client_kwargs["scope"] = settings.oauth_scope

oauth.register(
    name="aferisai",
    client_id=settings.oauth_client_id,
    client_secret=settings.oauth_client_secret,
    authorize_url=settings.oauth_authorize_url,
    access_token_url=settings.oauth_token_url,
    client_kwargs=client_kwargs,
)


class OAuthService:
    def __init__(self) -> None:
        self._refresh_lock = asyncio.Lock()

    async def start_login(self, request: Request):
        self._ensure_configured()
        code_verifier = secrets.token_urlsafe(64)
        request.session["oauth_code_verifier"] = code_verifier
        return await oauth.aferisai.authorize_redirect(
            request, settings.oauth_redirect_uri, code_verifier=code_verifier
        )

    async def finish_login(self, request: Request):
        self._ensure_configured()
        token = await oauth.aferisai.authorize_access_token(request)
        token["_code_verifier"] = request.session.pop("oauth_code_verifier", "")
        session_id = request.session.get("auth_session_id") or secrets.token_urlsafe(32)
        token_store.save(session_id, token)
        request.session["auth_session_id"] = session_id

    def status(self, request: Request) -> dict[str, Any]:
        token = token_store.get(request.session.get("auth_session_id"))
        if not token or not token.get("access_token"):
            return {"authenticated": False}
        expires_at = _expires_at(token)
        return {
            "authenticated": True,
            "token_type": token.get("token_type", "Bearer"),
            "expires_at": expires_at,
            "expires_in": max(0, int(expires_at - time.time())) if expires_at else None,
            "refresh_available": bool(token.get("refresh_token")),
        }

    async def access_token(self, request: Request) -> str:
        token = token_store.get(request.session.get("auth_session_id"))
        if not token or not token.get("access_token"):
            raise HTTPException(status_code=401, detail="Autentique-se para continuar.")
        if _expires_at(token) and _expires_at(token) - time.time() <= 60:
            token = await self._refresh(request, token)
        return str(token["access_token"])

    async def _refresh(self, request: Request, token: dict[str, Any]) -> dict[str, Any]:
        async with self._refresh_lock:
            current = token_store.get(request.session.get("auth_session_id")) or token
            if _expires_at(current) and _expires_at(current) - time.time() > 60:
                return current
            refresh_token = str(current.get("refresh_token") or "")
            code_verifier = str(current.get("_code_verifier") or "")
            if not refresh_token or not code_verifier:
                raise HTTPException(status_code=401, detail="A autorização expirou. Conecte-se novamente.")
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.post(
                        settings.oauth_token_url,
                        data={
                            "grant_type": "refresh_token",
                            "refresh_token": refresh_token,
                            "code_verifier": code_verifier,
                        },
                        auth=(settings.oauth_client_id, settings.oauth_client_secret),
                    )
            except httpx.RequestError as error:
                raise HTTPException(status_code=503, detail="Não foi possível renovar a autorização AferisAI.") from error
            if response.status_code != 200:
                token_store.delete(request.session.get("auth_session_id"))
                raise HTTPException(status_code=401, detail="A autorização expirou. Conecte-se novamente.")
            try:
                renewed = response.json()
            except ValueError as error:
                raise HTTPException(status_code=502, detail="A renovação retornou uma resposta inválida.") from error
            if not isinstance(renewed, dict) or not renewed.get("access_token"):
                raise HTTPException(status_code=502, detail="A renovação não retornou um token válido.")
            renewed["_code_verifier"] = code_verifier
            token_store.save(request.session.get("auth_session_id"), renewed)
            return renewed

    def logout(self, request: Request) -> None:
        token_store.delete(request.session.get("auth_session_id"))
        request.session.clear()

    @staticmethod
    def _ensure_configured() -> None:
        required = {
            "OAUTH_CLIENT_ID": settings.oauth_client_id,
            "OAUTH_CLIENT_SECRET": settings.oauth_client_secret,
            "OAUTH_AUTHORIZE_URL": settings.oauth_authorize_url,
            "OAUTH_TOKEN_URL": settings.oauth_token_url,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise HTTPException(
                status_code=503,
                detail=f"Configure no server/.env: {', '.join(missing)}",
            )


oauth_service = OAuthService()


def _expires_at(token: dict[str, Any]) -> float | None:
    value = token.get("expires_at")
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            from datetime import datetime
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    expires_in = token.get("expires_in")
    return time.time() + float(expires_in) if isinstance(expires_in, (int, float)) else None
