from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.services.registry_api import registry_api

router = APIRouter(prefix="/api/registry-offices", tags=["registry-offices"])


@router.get("")
async def list_registry_offices(
    state: str = Query(pattern=r"^[A-Z]{2}$"),
    city: str | None = Query(default=None, min_length=2, max_length=80),
    cns: str | None = Query(default=None, min_length=1, max_length=50, pattern=r"^[0-9]+$"),
    search: str | None = Query(default=None, min_length=2, max_length=80),
    cursor: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> JSONResponse:
    filters = {
        key: value
        for key, value in {
            "state": state,
            "city": city,
            "cns": cns,
            "search": search,
            "cursor": cursor,
            "limit": limit,
        }.items()
        if value is not None
    }
    return await registry_api.list_offices(filters)
