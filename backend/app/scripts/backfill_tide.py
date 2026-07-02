"""One-time backfill of tide_height_ft/tide_direction on existing catches.

Run after the migration that adds those columns:

    python -m app.scripts.backfill_tide

Safe to re-run — only touches catches where tide_height_ft is still null.
NOAA's predictions are astronomical, not observed, so this works the same
way for old catches as it does for new ones going forward.
"""

import time

from app.database import SessionLocal
from app.models import Catch
from app.tide import TideUnavailable, get_tide_at

# Polite pacing — this is a one-time script, not a hot path, and NOAA's
# public API doesn't need to be hammered.
DELAY_SECONDS = 0.25


def run() -> None:
    db = SessionLocal()
    try:
        catches = db.query(Catch).filter(Catch.tide_height_ft.is_(None)).order_by(Catch.id).all()
        print(f"Found {len(catches)} catch(es) missing tide data.")

        updated = 0
        failed = 0
        for catch in catches:
            try:
                catch.tide_height_ft, catch.tide_direction = get_tide_at(catch.caught_at)
                updated += 1
            except TideUnavailable as exc:
                failed += 1
                print(f"  catch {catch.id} ({catch.caught_at}): {exc}")
            time.sleep(DELAY_SECONDS)

        db.commit()
        print(f"Done. Updated {updated}, failed {failed}.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
