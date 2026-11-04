from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.models.payer_profile import PayerProfileInput
from app.core.settings import settings
from app.services.oauth_service import oauth_service
from app.services.registry_api import registry_api

router = APIRouter(prefix="/api/payer-profile", tags=["payer-profile"])


def upstream_session_headers(request: Request) -> dict[str, str]:
    cookies = []
    for part in request.headers.get("cookie", "").split(";"):
        name = part.strip().split("=", 1)[0]
        if name in {"__Host-aferis_user", "aferis_user"}:
            cookies.append(part.strip())
    headers = {"Cookie": "; ".join(cookies)} if cookies else {}
    headers["Origin"] = settings.aferis_user_origin
    if value := request.headers.get("x-csrf-token"):
        headers["X-CSRF-Token"] = value
    return headers


@router.post("/csrf")
async def renew_payer_csrf(request: Request) -> JSONResponse:
    return await registry_api.renew_user_csrf(upstream_session_headers(request))


@router.get("")
async def get_payer_profile(request: Request) -> JSONResponse:
    return await registry_api.get_payer_profile(
        oauth_service.access_token(request), upstream_session_headers(request)
    )


@router.post("")
async def create_payer_profile(
    payload: PayerProfileInput, request: Request
) -> JSONResponse:
    return await registry_api.create_payer_profile(
        oauth_service.access_token(request), payload.model_dump(), upstream_session_headers(request)
    )
