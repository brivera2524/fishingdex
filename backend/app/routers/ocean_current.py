from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.models import User
from app.ocean_current import CurrentFieldUnavailable, get_current_field

router = APIRouter(prefix="/ocean-current", tags=["ocean-current"])


@router.get("/field")
def read_current_field(current_user: User = Depends(get_current_user)) -> list[dict]:
    try:
        return get_current_field()
    except CurrentFieldUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
