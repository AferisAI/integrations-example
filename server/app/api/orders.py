from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.models.orders import OrderPaymentInput
from app.models.registry_request import RegistryRequestInput, is_uuid7
from app.services.oauth_service import oauth_service
from app.services.partner_orders import partner_order_service

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("/legal-documents")
async def list_legal_documents(request: Request) -> dict[str, object]:
    return await partner_order_service.legal_documents.catalog(
        oauth_service.access_token(request)
    )


@router.post("")
async def create_order(
    payload: RegistryRequestInput,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> JSONResponse:
    if not is_uuid7(idempotency_key):
        return JSONResponse(
            status_code=422,
            content={"detail": "Idempotency-Key deve ser UUIDv7."},
        )
    result = await partner_order_service.create(
        oauth_service.access_token(request), idempotency_key, payload
    )
    return JSONResponse(status_code=result.status_code, content=result.body, headers=result.headers)


@router.get("/{order_id}")
async def get_order(order_id: str, request: Request) -> JSONResponse:
    result = await partner_order_service.get(
        oauth_service.access_token(request), _validate_id(order_id)
    )
    return JSONResponse(status_code=result.status_code, content=result.body, headers=result.headers)


@router.post("/{order_id}/payment")
async def confirm_payment(
    order_id: str, payload: OrderPaymentInput, request: Request
) -> JSONResponse:
    result = await partner_order_service.pay(
        oauth_service.access_token(request), _validate_id(order_id), payload
    )
    return JSONResponse(status_code=result.status_code, content=result.body, headers=result.headers)


def _validate_id(value: str) -> str:
    if not value or "/" in value:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="ID da ordem inválido.")
    return value
