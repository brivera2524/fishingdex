"""Hides a dev/test account from the anglers roster (GET /users) and the
angler leaderboard, without touching anything else about it — their catches
still show normally on the map/dex/species leaderboards unless also excluded
via app/scripts/exclude_from_leaderboard.py.

    python -m app.scripts.hide_from_anglers "display name"
"""

import sys

from app.database import SessionLocal
from app.models import User


def run(display_name: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.display_name == display_name).first()
        if not user:
            print(f"No user found with display name {display_name!r}.")
            return
        if user.is_hidden:
            print(f"{display_name!r} (id={user.id}) is already hidden.")
            return
        user.is_hidden = True
        db.commit()
        print(f"Hid {display_name!r} (id={user.id}) from the anglers list.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print('Usage: python -m app.scripts.hide_from_anglers "display name"')
        sys.exit(1)
    run(sys.argv[1])
