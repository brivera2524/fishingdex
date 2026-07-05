import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import PushSubscription, User

logger = logging.getLogger(__name__)

# Each user's notification_mode is a set-membership check against the tier a
# given catch event is classified as. A record is definitionally also "a
# catch", but gets the more exciting record-tier message instead of a
# duplicate generic one — so each event is classified once (record > pb >
# catch) and only recipients whose mode covers that tier receive it.
# "challenge_leader" is orthogonal to that chain (a catch can be both a PB
# and a new challenge leader) but bundled into the same tiers as "record" —
# per explicit user choice, this reuses the existing dial rather than adding
# a dedicated settings toggle.
MODE_TIERS: dict[str, set[str]] = {
    "all": {"catch", "pb", "record", "challenge_leader"},
    "pb_and_record": {"pb", "record", "challenge_leader"},
    "record_only": {"record", "challenge_leader"},
    "off": set(),
}


def _send_one(db: Session, sub: PushSubscription, payload: dict) -> None:
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_admin_email},
        )
    except WebPushException as exc:
        if exc.response is not None and exc.response.status_code in (404, 410):
            # Push service says this subscription is gone for good (browser
            # unsubscribed, PWA uninstalled, etc.) — stop trying it.
            db.delete(sub)
            db.commit()
        else:
            logger.warning("Push send failed for subscription %s: %s", sub.id, exc)


def notify_catch_event(
    db: Session,
    catcher_id: int,
    tier: str,
    title: str,
    body: str,
    url: str = "/leaderboard",
) -> None:
    """Sends one push notification to every user (except the catcher) whose
    notification_mode includes this event's tier. At 5-10 users a plain
    sequential loop is plenty — no queue needed."""
    payload = {"title": title, "body": body, "url": url}
    recipients = db.query(User).filter(User.id != catcher_id).all()
    for user in recipients:
        if tier not in MODE_TIERS.get(user.notification_mode, set()):
            continue
        subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
        for sub in subs:
            _send_one(db, sub, payload)


def notify_catch_event_task(catcher_id: int, tier: str, title: str, body: str, url: str = "/leaderboard") -> None:
    """FastAPI BackgroundTasks entry point — runs after the catch-save
    response has already been sent, so however long it takes to reach every
    recipient's push service (one HTTPS round trip each) never blocks the
    client waiting on the save. Opens its own DB session rather than reusing
    the request's, since that one is torn down once the response is sent."""
    db = SessionLocal()
    try:
        notify_catch_event(db, catcher_id, tier, title, body, url)
    except Exception:
        logger.exception("Background push notification task failed for catcher %s", catcher_id)
    finally:
        db.close()


def notify_comment(db: Session, catch_owner_id: int, title: str, body: str, url: str = "/dex") -> None:
    """Not gated by notification_mode's catch tiers — that setting is about
    which OTHER PEOPLE's catches to hear about, not whether to be told
    someone commented on your own. Only "off" (a real kill switch for all
    push) suppresses it."""
    owner = db.get(User, catch_owner_id)
    if not owner or owner.notification_mode == "off":
        return
    payload = {"title": title, "body": body, "url": url}
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == catch_owner_id).all()
    for sub in subs:
        _send_one(db, sub, payload)


def notify_comment_task(catch_owner_id: int, title: str, body: str, url: str = "/dex") -> None:
    db = SessionLocal()
    try:
        notify_comment(db, catch_owner_id, title, body, url)
    except Exception:
        logger.exception("Background comment notification task failed for catch owner %s", catch_owner_id)
    finally:
        db.close()
