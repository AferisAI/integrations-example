import base64
import hashlib
import httpx
import json
import secrets
import time
from typing import Any

from authlib.integrations.starlette_client import OAuth as StarletteOAuth
from authlib.integrations.starlette_client.integration import StarletteIntegration
from fastapi import HTTPException
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
    async def start_login(self, request: Request):
        self._ensure_configured()
        verifier = secrets.token_urlsafe(32)
        challenge = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode("utf-8")).digest()
        ).rstrip(b"=").decode("utf-8")
        request.session["aferisai_code_verifier"] = verifier
        return await oauth.aferisai.authorize_redirect(
            request,
            settings.oauth_redirect_uri,
            code_verifier=verifier,
            code_challenge=challenge,
            code_challenge_method="S256",
        )

    async def finish_login(self, request: Request):
        self._ensure_configured()
        token = await oauth.aferisai.authorize_access_token(request)
        if not isinstance(token, dict):
            token = dict(token or {})
        if "expires_in" in token and "expires_at" not in token:
            token["expires_at"] = time.time() + int(token["expires_in"])
        token["code_verifier"] = request.session.get("aferisai_code_verifier")
        session_id = request.session.get("auth_session_id") or secrets.token_urlsafe(32)
        token_store.save(session_id, token)
        request.session["auth_session_id"] = session_id
        request.session.pop("aferisai_code_verifier", None)

    async def status(self, request: Request) -> dict[str, Any]:
        session_id = request.session.get("auth_session_id")
        token = token_store.get(session_id)
        if not token or not token.get("access_token"):
            return {"authenticated": False}
        # A AferisAI não emite refresh token: o token delegado vale 15 minutos.
        # Quando ele expira, o estado local também expira e o titular precisa
        # autorizar novamente, sem fingir renovação silenciosa.
        if self._token_expired(token):
            refreshed = None
            try:
                refreshed = await self._refresh_token(token)
            except Exception:
                refreshed = None
            if refreshed and refreshed.get("access_token"):
                token_store.save(session_id, refreshed)
                return {"authenticated": True}
            token_store.delete(session_id)
            try:
                request.session.clear()
            except Exception:
                pass
            return {"authenticated": False}
        return {"authenticated": True}

    async def access_token(self, request: Request) -> str:
        session_id = request.session.get("auth_session_id")
        token = token_store.get(session_id)
        if not token or not token.get("access_token"):
            raise HTTPException(status_code=401, detail="Autentique-se para continuar.")

        if self._token_expired(token):
            refreshed = await self._refresh_token(token)
            if refreshed and refreshed.get("access_token"):
                if "expires_at" not in refreshed and "expires_in" in refreshed:
                    refreshed["expires_at"] = time.time() + int(refreshed["expires_in"])
                if "code_verifier" not in refreshed:
                    refreshed["code_verifier"] = token.get("code_verifier")
                if "refresh_token" not in refreshed:
                    refreshed["refresh_token"] = token.get("refresh_token")
                token_store.save(session_id, refreshed)
                token = refreshed
            else:
                token_store.delete(session_id)
                try:
                    request.session.clear()
                except Exception:
                    pass
                raise HTTPException(
                    status_code=401,
                    detail="A sessão AferisAI expirou. Conecte novamente.",
                )

        return str(token["access_token"])

    @staticmethod
    def _token_expired(token: dict[str, Any]) -> bool:
        expires_at = token.get("expires_at")
        if expires_at is None:
            return False
        try:
            return time.time() >= (float(expires_at) - 60)
        except (TypeError, ValueError):
            return False

    async def _refresh_token(self, token: dict[str, Any]) -> dict[str, Any] | None:
        refresh_token = token.get("refresh_token")
        code_verifier = token.get("code_verifier")
        if not refresh_token or not code_verifier:
            return None
        self._ensure_configured()
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
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            if response.status_code != 200:
                return None
            refreshed = response.json()
            if not isinstance(refreshed, dict) or not refreshed.get("access_token"):
                return None
            if "expires_at" not in refreshed and "expires_in" in refreshed:
                refreshed["expires_at"] = time.time() + int(refreshed["expires_in"])
            if "refresh_token" not in refreshed:
                refreshed["refresh_token"] = refresh_token
            if "code_verifier" not in refreshed:
                refreshed["code_verifier"] = code_verifier
            return refreshed
        except Exception:
            return None

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
