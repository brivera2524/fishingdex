from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Catch, User
from app.schemas import CatchOut, UserStat

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserStat])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(
            User.id,
            User.display_name,
            func.count(Catch.id).label("catch_count"),
            func.count(func.distinct(Catch.species_id)).label("species_count"),
        )
        .outerjoin(Catch, (Catch.user_id == User.id) & Catch.counts_for_leaderboard)
        .group_by(User.id)
        .order_by(func.count(Catch.id).desc())
        .all()
    )
    return [
        UserStat(id=r.id, display_name=r.display_name, catch_count=r.catch_count, species_count=r.species_count)
        for r in rows
    ]


@router.get("/{user_id}/catches", response_model=list[CatchOut])
def list_user_catches(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(User, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return (
        db.query(Catch)
        .options(joinedload(Catch.species))
        .filter(Catch.user_id == user_id)
        .order_by(Catch.caught_at.desc())
        .all()
    )
