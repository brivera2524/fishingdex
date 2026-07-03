from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import Catch


@dataclass
class RecordCheck:
    is_new: bool
    previous_holder_name: str | None = None
    previous_weight: float | None = None


def _previous_best(db: Session, user_id: int, species_id: int, exclude_catch_id: int) -> Catch | None:
    return (
        db.query(Catch)
        .filter(
            Catch.user_id == user_id,
            Catch.species_id == species_id,
            Catch.weight.isnot(None),
            Catch.id != exclude_catch_id,
        )
        .order_by(Catch.weight.desc())
        .first()
    )


def _previous_leader(db: Session, species_id: int, exclude_catch_id: int) -> Catch | None:
    return (
        db.query(Catch)
        .filter(Catch.species_id == species_id, Catch.weight.isnot(None), Catch.id != exclude_catch_id)
        .order_by(Catch.weight.desc())
        .first()
    )


def check_personal_best(db: Session, catch: Catch) -> RecordCheck:
    """Only counts as a PB if it actually beats a prior catch of that species
    — a user's first-ever catch of a species isn't a "personal best" in any
    meaningful sense, and treating it as one would notify constantly while
    this small group is still discovering new species."""
    if catch.weight is None:
        return RecordCheck(is_new=False)
    prev = _previous_best(db, catch.user_id, catch.species_id, catch.id)
    if prev and catch.weight > prev.weight:
        return RecordCheck(is_new=True, previous_weight=prev.weight)
    return RecordCheck(is_new=False)


def check_leaderboard_record(db: Session, catch: Catch) -> RecordCheck:
    if catch.weight is None:
        return RecordCheck(is_new=False)
    prev = _previous_leader(db, catch.species_id, catch.id)
    if prev and catch.weight > prev.weight:
        holder_name = prev.user.display_name if prev.user_id != catch.user_id else None
        return RecordCheck(is_new=True, previous_holder_name=holder_name, previous_weight=prev.weight)
    return RecordCheck(is_new=False)
