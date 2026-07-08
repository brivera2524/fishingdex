from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.models import User
from app.ocean_current import CurrentFieldUnavailable, get_current_field
from app.ocean_sim import BayCurrentUnavailable, get_bay_current_field

router = APIRouter(prefix="/ocean-current", tags=["ocean-current"])


@router.get("/field")
def read_current_field(current_user: User = Depends(get_current_user)) -> list[dict]:
    try:
        return get_current_field()
    except CurrentFieldUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/bay-field")
def read_bay_current_field(current_user: User = Depends(get_current_user)) -> dict:
    """Simulated San Diego Bay interior current — see app/ocean_sim.py for
    what this is and its confidence caveats."""
    try:
        return get_bay_current_field()
    except BayCurrentUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
