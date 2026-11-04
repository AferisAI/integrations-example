from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.core.settings import settings
from app.services.oauth_service import oauth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(request: Request):
    return await oauth_service.start_login(request)


@router.get("/callback")
async def callback(request: Request):
    await oauth_service.finish_login(request)
    return RedirectResponse(settings.frontend_url)


@router.get("/status")
def status(request: Request):
    return oauth_service.status(request)


@router.post("/logout")
def logout(request: Request):
    oauth_service.logout(request)
    return {"authenticated": False}
