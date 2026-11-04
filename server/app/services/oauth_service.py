import secrets
from typing import Any

from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException
from starlette.requests import Request

from app.core.settings import settings
from app.repositories.token_store import token_store

oauth = OAuth()
client_kwargs: dict[str, Any] = {
    "code_challenge_method": "S256",
    "token_endpoint_auth_method": settings.oauth_token_auth_method
}
if settings.oauth_scope:
    client_kwargs["scope"] = settings.oauth_scope

oauth.register(
    name="aferisai",
    client_id=settings.oauth_client_id,
    client_secret=settings.oauth_client_secret,
    authorize_url=settings.oauth_authorize_url,
    access_token_url=settings.oauth_token_url,
    client_kwargs=client_kwargs
)


class OAuthService:
    async def start_login(self, request: Request):
        self._ensure_configured()
        return await oauth.aferisai.authorize_redirect(
            request, settings.oauth_redirect_uri
        )

    async def finish_login(self, request: Request):
        self._ensure_configured()
        token = await oauth.aferisai.authorize_access_token(request)
        session_id = request.session.get("auth_session_id") or secrets.token_urlsafe(32)
        token_store.save(session_id, token)
        request.session["auth_session_id"] = session_id

    def status(self, request: Request) -> dict[str, Any]:
        token = token_store.get(request.session.get("auth_session_id"))
        return {"authenticated": token is not None}

    def access_token(self, request: Request) -> str:
        token = token_store.get(request.session.get("auth_session_id"))
        if not token or not token.get("access_token"):
            raise HTTPException(status_code=401, detail="Autentique-se para continuar.")
        return str(token["access_token"])

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
