from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Catch, Species, User
from app.schemas import AnglerStat, ChallengeOut, LeaderboardCatch, SpeciesOut, SpeciesRecord

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])

# Combined "species" leaderboards spanning a few real species anglers treat
# as one loose category — e.g. San Diego's three inshore Paralabrax bass are
# usually just called "bass" regardless of which of the three it actually
# is. Keyed by a negative id so it can never collide with a real species'
# primary key; species_catch_leaderboard below special-cases these ids to
# pull catches from every species in the group instead of Catch.species_id.
SPECIES_GROUPS: dict[int, tuple[str, list[str]]] = {
    -1: ("The Big Three", ["Calico Bass", "Barred Sand Bass", "Spotted Bay Bass"]),
}

# Time-boxed challenges: rank each participant by their single best catch
# (within the window, of the given species group) rather than every catch —
# "everyone has one biggest fish at a time." A plain list rather than a DB
# table/migration since these are rare, hand-configured one-offs; add a new
# entry here for the next one rather than building admin CRUD for something
# that happens a couple times a year at most.
CHALLENGES: list[dict] = [
    {
        "id": "big-three-2026-07",
        "name": "The Big Three Challenge",
        "species_group_id": -1,
        # 12:00 PM Pacific on each date — both July 5 and Aug 5, 2026 fall
        # within PDT (UTC-7), so these are given directly in UTC rather than
        # depending on a timezone database for a fixed, already-known offset.
        "starts_at": datetime(2026, 7, 5, 19, 0, tzinfo=timezone.utc),
        "ends_at": datetime(2026, 8, 5, 19, 0, tzinfo=timezone.utc),
    },
]


def _to_leaderboard_catch(catch: Catch) -> LeaderboardCatch:
    return LeaderboardCatch(
        id=catch.id,
        display_name=catch.user.display_name,
        weight=catch.weight,
        length=catch.length,
        caught_at=catch.caught_at,
        photo_url=catch.photo_url,
        photos=catch.photos,
        latitude=catch.latitude,
        longitude=catch.longitude,
        tide_height_ft=catch.tide_height_ft,
        tide_direction=catch.tide_direction,
        spot=catch.spot,
    )


@router.get("/species", response_model=list[SpeciesRecord])
def species_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    species_list = db.query(Species).order_by(Species.common_name).all()
    records = []
    for sp in species_list:
        catch_count = (
            db.query(Catch)
            .filter(Catch.species_id == sp.id, Catch.counts_for_leaderboard)
            .count()
        )
        top_catch = (
            db.query(Catch)
            .options(joinedload(Catch.user), joinedload(Catch.spot), joinedload(Catch.photos))
            .filter(Catch.species_id == sp.id, Catch.weight.isnot(None), Catch.counts_for_leaderboard)
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

    for group_id, (group_name, member_names) in SPECIES_GROUPS.items():
        base_query = db.query(Catch).join(Species).filter(
            Species.common_name.in_(member_names), Catch.counts_for_leaderboard
        )
        catch_count = base_query.count()
        top_catch = (
            base_query.options(joinedload(Catch.user), joinedload(Catch.spot), joinedload(Catch.photos))
            .filter(Catch.weight.isnot(None))
            .order_by(Catch.weight.desc())
            .first()
        )
        records.append(
            SpeciesRecord(
                species=SpeciesOut(id=group_id, common_name=group_name),
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
    if species_id in SPECIES_GROUPS:
        _, member_names = SPECIES_GROUPS[species_id]
        catches = (
            db.query(Catch)
            .join(Species)
            .options(joinedload(Catch.user), joinedload(Catch.photos))
            .filter(
                Species.common_name.in_(member_names),
                Catch.weight.isnot(None),
                Catch.counts_for_leaderboard,
            )
            .order_by(Catch.weight.desc())
            .all()
        )
        return [_to_leaderboard_catch(c) for c in catches]

    catches = (
        db.query(Catch)
        .options(joinedload(Catch.user), joinedload(Catch.photos))
        .filter(Catch.species_id == species_id, Catch.weight.isnot(None), Catch.counts_for_leaderboard)
        .order_by(Catch.weight.desc())
        .all()
    )
    return [_to_leaderboard_catch(c) for c in catches]


@router.get("/challenges", response_model=list[ChallengeOut])
def list_challenges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    results = []
    for cfg in CHALLENGES:
        _, member_names = SPECIES_GROUPS[cfg["species_group_id"]]

        # Each participant's single best qualifying catch in the window —
        # "everyone has one biggest fish at a time" — found via each user's
        # max weight, then joined back to the actual catch row(s) at that
        # weight (ties are deduped below, keeping just one).
        best_per_user = (
            db.query(Catch.user_id, func.max(Catch.weight).label("max_weight"))
            .join(Species)
            .join(User, Catch.user_id == User.id)
            .filter(
                Species.common_name.in_(member_names),
                Catch.weight.isnot(None),
                Catch.caught_at >= cfg["starts_at"],
                Catch.caught_at < cfg["ends_at"],
                Catch.counts_for_leaderboard,
                ~User.is_hidden,
            )
            .group_by(Catch.user_id)
            .subquery()
        )
        rows = (
            db.query(Catch)
            .join(
                best_per_user,
                (Catch.user_id == best_per_user.c.user_id) & (Catch.weight == best_per_user.c.max_weight),
            )
            .options(joinedload(Catch.user), joinedload(Catch.spot), joinedload(Catch.photos))
            .order_by(Catch.weight.desc())
            .all()
        )

        seen_users: set[int] = set()
        standings = []
        for catch in rows:
            if catch.user_id in seen_users:
                continue
            seen_users.add(catch.user_id)
            standings.append(_to_leaderboard_catch(catch))

        if now < cfg["starts_at"]:
            status = "upcoming"
        elif now < cfg["ends_at"]:
            status = "active"
        else:
            status = "ended"

        results.append(
            ChallengeOut(
                id=cfg["id"],
                name=cfg["name"],
                starts_at=cfg["starts_at"],
                ends_at=cfg["ends_at"],
                status=status,
                standings=standings,
            )
        )
    return results


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
        .filter(Catch.counts_for_leaderboard, ~User.is_hidden)
        .group_by(User.id)
        .order_by(func.count(Catch.id).desc())
        .all()
    )
    return [
        AnglerStat(display_name=r.display_name, catch_count=r.catch_count, species_count=r.species_count)
        for r in rows
    ]
