import json
from dataclasses import dataclass
from typing import Any, Protocol

from fastapi import HTTPException

from app.models.orders import OrderPaymentInput
from app.models.registry_request import RegistryRequestInput
from app.services.registry_api import registry_api
from app.services.legal_documents import LegalDocumentService


class RegistryGateway(Protocol):
    async def get_legal_documents(self, access_token: str): ...
    async def create(self, access_token: str, idempotency_key: str, payload: RegistryRequestInput): ...
    async def get(self, access_token: str, operation_id: str): ...
    async def get_quote(self, access_token: str, operation_id: str): ...
    async def get_pix(self, access_token: str, operation_id: str): ...
    async def preview(self, access_token: str, operation_id: str): ...
    async def quote(self, access_token: str, operation_id: str, payload: dict[str, Any] | None = None): ...
    async def create_pix(self, access_token: str, operation_id: str, payload: dict[str, Any]): ...
    async def create_credits(self, access_token: str, operation_id: str, payload: dict[str, Any]): ...


@dataclass(frozen=True)
class OrderResult:
    status_code: int
    body: dict[str, Any]
    headers: dict[str, str]


class PartnerOrderService:
    """High-level order workflow over the legacy partner API operations."""

    def __init__(
        self,
        gateway: RegistryGateway = registry_api,
        legal_documents: LegalDocumentService | None = None,
    ) -> None:
        self.gateway = gateway
        self.legal_documents = legal_documents or LegalDocumentService(gateway)

    async def create(
        self, access_token: str, idempotency_key: str, payload: RegistryRequestInput
    ) -> OrderResult:
        upstream = await self.gateway.create(access_token, idempotency_key, payload)
        body = _json_body(upstream)
        if not _successful(upstream.status_code):
            return _problem(upstream.status_code, body, upstream.headers)
        order_id = _order_id(body, upstream.headers.get("location"))
        if not order_id:
            raise HTTPException(status_code=502, detail="A API não retornou o ID da ordem.")
        return OrderResult(
            upstream.status_code,
            {"id": order_id, "state": "created", "next_action": "refresh", "order": body},
            _forward_headers(upstream.headers),
        )

    async def get(self, access_token: str, order_id: str) -> OrderResult:
        order_response = await self.gateway.get(access_token, order_id)
        order_body = _json_body(order_response)
        if not _successful(order_response.status_code):
            return _problem(order_response.status_code, order_body, order_response.headers)

        quote_response = await self.gateway.get_quote(access_token, order_id)
        payment_response = await self.gateway.get_pix(access_token, order_id)
        quote = _optional_success_body(quote_response)
        payment = _optional_success_body(payment_response)
        state, next_action = _order_state(quote, payment)
        return OrderResult(
            200,
            {
                "id": order_id,
                "state": state,
                "next_action": next_action,
                "order": order_body,
                "quote": quote,
                "payment": payment,
            },
            _forward_headers(order_response.headers),
        )

    async def pay(
        self, access_token: str, order_id: str, payload: OrderPaymentInput
    ) -> OrderResult:
        # Payment can be retried after the user refreshed the order. Reusing an
        # existing quote is safe; repeating the provider preview is not.
        existing_quote = await self.gateway.get_quote(access_token, order_id)
        if _successful(existing_quote.status_code):
            quote_body = _json_body(existing_quote)
        else:
            preview = await self.gateway.preview(access_token, order_id)
            if not _successful(preview.status_code):
                return _problem(preview.status_code, _json_body(preview), preview.headers)

            quote = await self.gateway.quote(access_token, order_id, {})
            if not _successful(quote.status_code):
                return _problem(quote.status_code, _json_body(quote), quote.headers)
            quote_body = _json_body(quote)

        payment_payload = await self.legal_documents.build_evidence(
            access_token, payload.legal_acceptance
        )
        if payload.method == "pix":
            payment_payload["payer"] = payload.payer.model_dump() if payload.payer else None
            payment = await self.gateway.create_pix(access_token, order_id, payment_payload)
        else:
            payment = await self.gateway.create_credits(access_token, order_id, payment_payload)
        payment_body = _json_body(payment)
        if not _successful(payment.status_code):
            return _problem(payment.status_code, payment_body, payment.headers)
        return OrderResult(
            payment.status_code,
            {
                "id": order_id,
                "state": "payment_created",
                "next_action": "refresh",
                "payment": payment_body,
            },
            _forward_headers(payment.headers),
        )


def _json_body(response: Any) -> dict[str, Any]:
    try:
        value = json.loads(response.body.decode("utf-8"))
    except (AttributeError, UnicodeDecodeError, json.JSONDecodeError):
        return {"detail": "Resposta inválida da API Aferisai."}
    return value if isinstance(value, dict) else {"data": value}


def _successful(status_code: int) -> bool:
    return 200 <= status_code < 300


def _optional_success_body(response: Any) -> dict[str, Any] | None:
    return _json_body(response) if _successful(response.status_code) else None


def _problem(status_code: int, body: dict[str, Any], headers: Any) -> OrderResult:
    return OrderResult(status_code, body, _forward_headers(headers))


def _forward_headers(headers: Any) -> dict[str, str]:
    return {key: headers[key] for key in ("location", "retry-after") if key in headers}


def _order_id(body: dict[str, Any], location: str | None) -> str | None:
    for key in ("id", "operation_id", "request_id"):
        value = body.get(key)
        if isinstance(value, str) and value:
            return value
    if location:
        return location.rstrip("/").split("/")[-1] or None
    return None


def _order_state(
    quote: dict[str, Any] | None, payment: dict[str, Any] | None
) -> tuple[str, str]:
    if payment:
        payment_status = str(payment.get("status", "")).lower()
        if payment_status in {"paid", "confirmed"}:
            return "paid", "refresh"
        return "processing", "refresh"
    if quote:
        return "requires_action", "confirm_payment"
    return "processing", "refresh"


partner_order_service = PartnerOrderService()
