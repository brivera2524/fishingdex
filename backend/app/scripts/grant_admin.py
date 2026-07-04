"""One-time admin grant, since there's no user-management UI (and doesn't
need to be one, for a friend-group app). Run against whichever database the
account lives in:

    python -m app.scripts.grant_admin "display name"
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
        if user.is_admin:
            print(f"{display_name!r} (id={user.id}) is already an admin.")
            return
        user.is_admin = True
        db.commit()
        print(f"Granted admin to {display_name!r} (id={user.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print('Usage: python -m app.scripts.grant_admin "display name"')
        sys.exit(1)
    run(sys.argv[1])
