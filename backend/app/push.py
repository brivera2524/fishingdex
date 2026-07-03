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
MODE_TIERS: dict[str, set[str]] = {
    "all": {"catch", "pb", "record"},
    "pb_and_record": {"pb", "record"},
    "record_only": {"record"},
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
