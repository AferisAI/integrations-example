from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Body, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from app.models.payments import RegistryPixCheckoutInput
from app.models.registry_request import RegistryRequestInput, is_uuid7
from app.services.oauth_service import oauth_service
from app.services.registry_api import registry_api

router = APIRouter(prefix="/api/registry-requests", tags=["registry-requests"])


@router.post("")
async def create_registry_request(
    payload: RegistryRequestInput,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> JSONResponse:
    if not is_uuid7(idempotency_key):
        raise HTTPException(status_code=422, detail="Idempotency-Key deve ser UUIDv7.")
    return await registry_api.create(
        oauth_service.access_token(request), idempotency_key, payload
    )


@router.get("/{operation_id}")
async def get_registry_request(operation_id: str, request: Request) -> JSONResponse:
    return await registry_api.get(
        oauth_service.access_token(request), _operation_id(operation_id)
    )


@router.post("/{operation_id}/preview")
async def preview_registry_request(operation_id: str, request: Request) -> JSONResponse:
    return await registry_api.preview(
        oauth_service.access_token(request), _operation_id(operation_id)
    )


@router.post("/{operation_id}/quote")
async def create_registry_quote(
    operation_id: str,
    request: Request,
    payload: dict[str, Any] | None = Body(default=None),
) -> JSONResponse:
    return await registry_api.quote(
        oauth_service.access_token(request), _operation_id(operation_id), payload
    )


@router.get("/{operation_id}/quote")
async def get_registry_quote(operation_id: str, request: Request) -> JSONResponse:
    return await registry_api.get_quote(
        oauth_service.access_token(request), _operation_id(operation_id)
    )


@router.post("/{operation_id}/pix")
async def create_registry_pix(
    operation_id: str, payload: RegistryPixCheckoutInput, request: Request
) -> JSONResponse:
    return await registry_api.create_pix(
        oauth_service.access_token(request),
        _operation_id(operation_id),
        payload.model_dump(),
    )


@router.get("/{operation_id}/pix")
async def get_registry_pix(operation_id: str, request: Request) -> JSONResponse:
    return await registry_api.get_pix(
        oauth_service.access_token(request), _operation_id(operation_id)
    )


def _operation_id(value: str) -> str:
    if not value or "/" in value:
        raise HTTPException(status_code=422, detail="ID do pedido inválido.")
    return quote(value, safe="")
