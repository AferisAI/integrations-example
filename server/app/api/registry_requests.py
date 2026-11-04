from urllib.parse import quote

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse

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
    if not operation_id or "/" in operation_id:
        raise HTTPException(status_code=422, detail="ID do pedido inválido.")
    encoded_id = quote(operation_id, safe="")
    return await registry_api.get(oauth_service.access_token(request), encoded_id)
