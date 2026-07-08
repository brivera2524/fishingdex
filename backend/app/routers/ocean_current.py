from fastapi import APIRouter, Depends, HTTPException, status

from app import ocean_sim
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


@router.get("/bay-field")
def read_bay_current_field(current_user: User = Depends(get_current_user)) -> dict:
    """Simulated San Diego Bay interior current — see app/ocean_sim.py for
    what this is and its confidence caveats. `status` is "warming_up" for a
    while after each deploy (the model needs ~30 min to spin up), "ready"
    once a run has completed, or "error" if the last run failed."""
    state = ocean_sim.get_state()
    if state["status"] != "ready":
        return {"status": state["status"], "records": None, "sim_time_utc": None, "error": state["error"]}
    return {
        "status": "ready",
        "records": state["records"],
        "sim_time_utc": state["sim_time_utc"].isoformat() if state["sim_time_utc"] else None,
    }
