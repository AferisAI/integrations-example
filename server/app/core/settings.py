import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _as_bool(value: str, default: bool = False) -> bool:
    return value.lower() in {"1", "true", "yes", "on"} if value else default


@dataclass(frozen=True)
class Settings:
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    session_secret: str = os.getenv("SESSION_SECRET", "change-this-local-development-secret")
    cookie_secure: bool = _as_bool(os.getenv("COOKIE_SECURE", "false"))
    aferis_api_url: str = os.getenv("AFERIS_API_URL", "https://api.aferis.ai").rstrip("/")
    oauth_client_id: str = os.getenv("OAUTH_CLIENT_ID", "")
    oauth_client_secret: str = os.getenv("OAUTH_CLIENT_SECRET", "")
    oauth_authorize_url: str = os.getenv("OAUTH_AUTHORIZE_URL", "")
    oauth_token_url: str = os.getenv("OAUTH_TOKEN_URL", "")
    oauth_redirect_uri: str = os.getenv(
        "OAUTH_REDIRECT_URI", "http://localhost:8000/auth/callback"
    )
    oauth_scope: str = os.getenv("OAUTH_SCOPE", "")
    oauth_token_auth_method: str = os.getenv(
        "OAUTH_TOKEN_AUTH_METHOD", "client_secret_basic"
    )


settings = Settings()
