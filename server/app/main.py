from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import router as auth_router
from app.api.registry_offices import router as registry_offices_router
from app.api.orders import router as orders_router
from app.core.settings import settings

app = FastAPI(title="Aferisai Partner API Example")
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    same_site="lax",
    https_only=settings.cookie_secure,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Idempotency-Key"],
    expose_headers=["Location", "Retry-After"],
)
app.include_router(auth_router)
app.include_router(registry_offices_router)
app.include_router(orders_router)


@app.get("/health")
def health():
    return {"status": "ok"}
