from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.geo import polygon_centroid
from app.models import Catch, Spot, User
from app.schemas import SpotCreate, SpotOut, SpotUpdate

router = APIRouter(prefix="/spots", tags=["spots"])


@router.get("", response_model=list[SpotOut])
def list_spots(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Spot).order_by(Spot.name).all()


@router.post("", response_model=SpotOut, status_code=status.HTTP_201_CREATED)
def create_spot(
    payload: SpotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    centroid_lat, centroid_lng = polygon_centroid(payload.polygon)
    spot = Spot(
        name=payload.name,
        polygon=payload.polygon,
        centroid_lat=centroid_lat,
        centroid_lng=centroid_lng,
        created_by_user_id=current_user.id,
    )
    db.add(spot)
    db.commit()
    db.refresh(spot)
    return spot


@router.put("/{spot_id}", response_model=SpotOut)
def update_spot(
    spot_id: int,
    payload: SpotUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    spot = db.get(Spot, spot_id)
    if not spot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spot not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(spot, field, value)

    db.commit()
    db.refresh(spot)
    return spot


@router.delete("/{spot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_spot(
    spot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    spot = db.get(Spot, spot_id)
    if not spot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spot not found")
    # Detach rather than cascade-delete the catches themselves — a spot going
    # away shouldn't take anyone's logged catches with it.
    db.query(Catch).filter(Catch.spot_id == spot_id).update({"spot_id": None})
    db.delete(spot)
    db.commit()
