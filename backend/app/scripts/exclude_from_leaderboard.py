"""One-time (re-runnable) exclusion of a user's existing catches from every
leaderboard/PB/record calculation, e.g. seed/test data logged on the app
owner's account while building it out, which shouldn't count as real fishing
once friends start logging their own catches. The catches keep their map
pin, photo, and dex/collection value — this only affects cross-user ranking.

Only touches catches that currently exist for that user at the moment this
runs; any new catch (on this account or any other) still defaults to
counting normally.

    python -m app.scripts.exclude_from_leaderboard "display name"
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

        catches = db.query(Catch).filter(Catch.user_id == user.id, Catch.counts_for_leaderboard).all()
        print(f"Excluding {len(catches)} catch(es) belonging to {display_name!r} (id={user.id}) from leaderboards.")

        for catch in catches:
            catch.counts_for_leaderboard = False
        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print('Usage: python -m app.scripts.exclude_from_leaderboard "display name"')
        sys.exit(1)
    run(sys.argv[1])
