"""Reverses app/scripts/exclude_from_leaderboard.py — brings all of a user's
currently-excluded catches back into leaderboards/PB/record detection and
angler catch/species counts.

    python -m app.scripts.include_in_leaderboard "display name"
"""

import sys

from app.database import SessionLocal
from app.models import Catch, User


def run(display_name: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.display_name == display_name).first()
        if not user:
            print(f"No user found with display name {display_name!r}.")
            return

        catches = db.query(Catch).filter(Catch.user_id == user.id, ~Catch.counts_for_leaderboard).all()
        print(f"Re-including {len(catches)} catch(es) belonging to {display_name!r} (id={user.id}) in leaderboards.")

        for catch in catches:
            catch.counts_for_leaderboard = True
        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print('Usage: python -m app.scripts.include_in_leaderboard "display name"')
        sys.exit(1)
    run(sys.argv[1])
