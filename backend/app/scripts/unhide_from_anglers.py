"""Reverses app/scripts/hide_from_anglers.py — brings an account back into
the anglers roster (GET /users) and the angler leaderboard.

    python -m app.scripts.unhide_from_anglers "display name"
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
        if not user.is_hidden:
            print(f"{display_name!r} (id={user.id}) is already visible.")
            return
        user.is_hidden = False
        db.commit()
        print(f"Unhid {display_name!r} (id={user.id}) — back on the anglers list.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print('Usage: python -m app.scripts.unhide_from_anglers "display name"')
        sys.exit(1)
    run(sys.argv[1])
