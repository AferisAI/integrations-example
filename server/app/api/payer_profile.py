from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.models.payer_profile import PayerProfileInput
from app.services.oauth_service import oauth_service
from app.services.registry_api import registry_api

router = APIRouter(prefix="/api/payer-profile", tags=["payer-profile"])


@router.get("")
async def get_payer_profile(request: Request) -> JSONResponse:
    return await registry_api.get_payer_profile(oauth_service.access_token(request))


@router.post("")
async def create_payer_profile(
    payload: PayerProfileInput, request: Request
) -> JSONResponse:
    return await registry_api.create_payer_profile(
        oauth_service.access_token(request), payload.model_dump()
    )
