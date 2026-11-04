from typing import Any

import httpx
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.core.settings import settings
from app.models.registry_request import RegistryRequestInput


class RegistryApi:
    async def list_offices(self, filters: dict[str, Any]) -> JSONResponse:
        return await self._request(
            "GET",
            "/v1/registry-offices",
            params=filters,
        )

    async def create(
        self, access_token: str, idempotency_key: str, payload: RegistryRequestInput
    ) -> JSONResponse:
        return await self._request(
            "POST",
            "/v1/partner/registry-requests/number",
            access_token,
            headers={"Idempotency-Key": idempotency_key},
            json=payload.model_dump(exclude_none=True),
        )

    async def get(self, access_token: str, operation_id: str) -> JSONResponse:
        return await self._request(
            "GET",
            f"/v1/partner/registry-requests/{operation_id}",
            access_token,
        )

    async def preview(self, access_token: str, operation_id: str) -> JSONResponse:
        return await self._request(
            "POST",
            f"/v1/partner/registry-requests/{operation_id}/preview",
            access_token,
        )

    async def quote(
        self, access_token: str, operation_id: str, payload: dict[str, Any] | None = None
    ) -> JSONResponse:
        return await self._request(
            "POST",
            f"/v1/partner/registry-requests/{operation_id}/quote",
            access_token,
            json=payload or {},
        )

    async def get_quote(self, access_token: str, operation_id: str) -> JSONResponse:
        return await self._request(
            "GET",
            f"/v1/partner/registry-requests/{operation_id}/quote",
            access_token,
        )

    async def create_pix(
        self, access_token: str, operation_id: str, payload: dict[str, Any]
    ) -> JSONResponse:
        return await self._request(
            "POST",
            f"/v1/partner/registry-requests/{operation_id}/pix",
            access_token,
            json=payload,
        )

    async def get_pix(self, access_token: str, operation_id: str) -> JSONResponse:
        return await self._request(
            "GET",
            f"/v1/partner/registry-requests/{operation_id}/pix",
            access_token,
        )

    async def _request(
        self,
        method: str,
        path: str,
        access_token: str | None = None,
        **kwargs: Any,
    ) -> JSONResponse:
        headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
        headers.update(kwargs.pop("headers", {}))
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.request(
                    method,
                    f"{settings.aferis_api_url}{path}",
                    headers=headers,
                    **kwargs,
                )
        except httpx.RequestError as error:
            raise HTTPException(
                status_code=503, detail="Não foi possível conectar à API Aferisai."
            ) from error

        try:
            body = response.json()
        except ValueError:
            body = {"detail": response.text or "Resposta inválida da API Aferisai."}

        headers = {
            key: response.headers[key]
            for key in ("location", "retry-after")
            if key in response.headers
        }
        return JSONResponse(status_code=response.status_code, content=body, headers=headers)


registry_api = RegistryApi()
