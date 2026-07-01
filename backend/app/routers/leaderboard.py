from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Catch, Species, User
from app.schemas import AnglerStat, LeaderboardCatch, SpeciesRecord

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


def _to_leaderboard_catch(catch: Catch) -> LeaderboardCatch:
    return LeaderboardCatch(
        id=catch.id,
        display_name=catch.user.display_name,
        weight=catch.weight,
        length=catch.length,
        caught_at=catch.caught_at,
        photo_url=catch.photo_url,
        latitude=catch.latitude,
        longitude=catch.longitude,
    )


@router.get("/species", response_model=list[SpeciesRecord])
def species_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    species_list = db.query(Species).order_by(Species.common_name).all()
    records = []
    for sp in species_list:
        catch_count = db.query(Catch).filter(Catch.species_id == sp.id).count()
        top_catch = (
            db.query(Catch)
            .options(joinedload(Catch.user))
            .filter(Catch.species_id == sp.id, Catch.weight.isnot(None))
            .order_by(Catch.weight.desc())
            .first()
        )
        records.append(
            SpeciesRecord(
                species=sp,
                catch_count=catch_count,
                top_catch=_to_leaderboard_catch(top_catch) if top_catch else None,
            )
        )
    return records


@router.get("/species/{species_id}", response_model=list[LeaderboardCatch])
def species_catch_leaderboard(
    species_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catches = (
        db.query(Catch)
        .options(joinedload(Catch.user))
        .filter(Catch.species_id == species_id, Catch.weight.isnot(None))
        .order_by(Catch.weight.desc())
        .all()
    )
    return [_to_leaderboard_catch(c) for c in catches]


@router.get("/anglers", response_model=list[AnglerStat])
def angler_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(
            User.display_name,
            func.count(Catch.id).label("catch_count"),
            func.count(func.distinct(Catch.species_id)).label("species_count"),
        )
        .join(Catch, Catch.user_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Catch.id).desc())
        .all()
    )
    return [
        AnglerStat(display_name=r.display_name, catch_count=r.catch_count, species_count=r.species_count)
        for r in rows
    ]
