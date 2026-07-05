from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Catch, Species, User


@dataclass
class RecordCheck:
    is_new: bool
    previous_holder_name: str | None = None
    previous_weight: float | None = None
    # Only populated by check_challenge_leader — which challenge this is, so
    # the notification message doesn't need to hardcode a name.
    challenge_name: str | None = None


def _previous_best(db: Session, user_id: int, species_id: int, exclude_catch_id: int) -> Catch | None:
    return (
        db.query(Catch)
        .filter(
            Catch.user_id == user_id,
            Catch.species_id == species_id,
            Catch.weight.isnot(None),
            Catch.id != exclude_catch_id,
            Catch.counts_for_leaderboard,
        )
        .order_by(Catch.weight.desc())
        .first()
    )


def _previous_leader(db: Session, species_id: int, exclude_catch_id: int) -> Catch | None:
    return (
        db.query(Catch)
        .filter(
            Catch.species_id == species_id,
            Catch.weight.isnot(None),
            Catch.id != exclude_catch_id,
            Catch.counts_for_leaderboard,
        )
        .order_by(Catch.weight.desc())
        .first()
    )


def check_personal_best(db: Session, catch: Catch) -> RecordCheck:
    """Only counts as a PB if it actually beats a prior catch of that species
    — a user's first-ever catch of a species isn't a "personal best" in any
    meaningful sense, and treating it as one would notify constantly while
    this small group is still discovering new species."""
    if catch.weight is None or not catch.counts_for_leaderboard:
        return RecordCheck(is_new=False)
    prev = _previous_best(db, catch.user_id, catch.species_id, catch.id)
    if prev and catch.weight > prev.weight:
        return RecordCheck(is_new=True, previous_weight=prev.weight)
    return RecordCheck(is_new=False)


def check_leaderboard_record(db: Session, catch: Catch) -> RecordCheck:
    if catch.weight is None or not catch.counts_for_leaderboard:
        return RecordCheck(is_new=False)
    prev = _previous_leader(db, catch.species_id, catch.id)
    if prev and catch.weight > prev.weight:
        holder_name = prev.user.display_name if prev.user_id != catch.user_id else None
        return RecordCheck(is_new=True, previous_holder_name=holder_name, previous_weight=prev.weight)
    return RecordCheck(is_new=False)


def check_challenge_leader(db: Session, catch: Catch) -> RecordCheck:
    """Unlike PB/record, the very first qualifying catch of a challenge DOES
    count as "becoming the leader" here (per explicit user choice) — there's
    a real, meaningful "first entrant takes the early lead" moment for a
    challenge that doesn't apply to an individual's personal-best history.

    Imported here rather than at module load time to avoid a real circular
    import: app.routers.leaderboard doesn't import app.records or
    app.routers.catches, so this is safe, but importing app.routers.catches
    imports app.records at startup — keeping the import local avoids any
    ordering surprise if that ever changes."""
    from app.routers.leaderboard import CHALLENGES, SPECIES_GROUPS

    if catch.weight is None or not catch.counts_for_leaderboard or catch.user.is_hidden:
        return RecordCheck(is_new=False)

    now = datetime.now(timezone.utc)
    for cfg in CHALLENGES:
        if not (cfg["starts_at"] <= now < cfg["ends_at"]):
            continue
        _, member_names = SPECIES_GROUPS[cfg["species_group_id"]]
        if catch.species.common_name not in member_names:
            continue

        prev = (
            db.query(Catch)
            .join(Species)
            .join(User, Catch.user_id == User.id)
            .filter(
                Species.common_name.in_(member_names),
                Catch.weight.isnot(None),
                Catch.id != catch.id,
                Catch.counts_for_leaderboard,
                ~User.is_hidden,
                Catch.caught_at >= cfg["starts_at"],
                Catch.caught_at < cfg["ends_at"],
            )
            .order_by(Catch.weight.desc())
            .first()
        )
        if prev is None:
            return RecordCheck(is_new=True, challenge_name=cfg["name"])
        if catch.weight > prev.weight:
            holder_name = prev.user.display_name if prev.user_id != catch.user_id else None
            return RecordCheck(
                is_new=True, previous_holder_name=holder_name, previous_weight=prev.weight,
                challenge_name=cfg["name"],
            )
        # Matched this challenge's species group but didn't take the lead —
        # keep checking other challenges (only one exists today, so this
        # loop always ends here in practice).

    return RecordCheck(is_new=False)
