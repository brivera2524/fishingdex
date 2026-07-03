"""One-time (re-runnable) backfill of spot_id on existing catches.

Run any time after adding new spots, so older catches inside a spot's
boundary get attributed to it too:

    python -m app.scripts.backfill_spots

Only touches catches where spot_id is still null and lat/lng are set.
"""

from app.database import SessionLocal
from app.geo import find_spot_for_point
from app.models import Catch


def run() -> None:
    db = SessionLocal()
    try:
        catches = (
            db.query(Catch)
            .filter(Catch.spot_id.is_(None), Catch.latitude.isnot(None), Catch.longitude.isnot(None))
            .order_by(Catch.id)
            .all()
        )
        print(f"Checking {len(catches)} catch(es) without a spot assigned.")

        updated = 0
        for catch in catches:
            spot_id = find_spot_for_point(db, catch.latitude, catch.longitude)
            if spot_id is not None:
                catch.spot_id = spot_id
                updated += 1

        db.commit()
        print(f"Done. Attributed {updated} catch(es) to a spot.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
