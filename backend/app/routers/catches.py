import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.geo import find_spot_for_point
from app.models import Catch, CatchPhoto, Species, User
from app.push import notify_catch_event_task
from app.records import check_challenge_leader, check_leaderboard_record, check_personal_best
from app.schemas import CatchCreate, CatchOut, CatchUpdate, MapCatch, RecentCatch
from app.tide import TideUnavailable, get_tide_at

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catches", tags=["catches"])

MAX_PHOTOS_PER_CATCH = 4


def _check_records_and_notify(db: Session, catch: Catch, background_tasks: BackgroundTasks) -> CatchOut:
    """Classifies the just-saved catch (record > pb > plain catch), returns a
    CatchOut carrying is_personal_best/is_leaderboard_record so the catcher's
    own client can play a celebration animation (they never get their own
    push, since recipients exclude the catcher), and schedules the actual
    push send as a background task.

    The record/PB checks themselves are just a couple of fast SELECTs, so
    they run inline. Sending, however, is a real HTTPS round trip per
    subscribed recipient — doing that synchronously here would make the
    client's save request wait on however long every recipient's push
    service takes to respond, which on a slow mobile connection can make a
    catch save look like it hung (or silently drop if the tab gets
    backgrounded mid-request). Scheduling it as a background task lets the
    response return immediately regardless."""
    is_pb = is_record = False
    previous_best_weight: float | None = None
    try:
        pb = check_personal_best(db, catch)
        record = check_leaderboard_record(db, catch)
        is_pb, is_record = pb.is_new, record.is_new
        if record.is_new:
            previous_best_weight = record.previous_weight
            beat = "their own record" if record.previous_holder_name is None else f"{record.previous_holder_name}'s record"
            background_tasks.add_task(
                notify_catch_event_task, catch.user_id, "record", "🏆 New leaderboard record!",
                f"{catch.user.display_name} just set the {catch.species.common_name} record "
                f"({catch.weight} lb), beating {beat}!",
            )
        elif pb.is_new:
            previous_best_weight = pb.previous_weight
            background_tasks.add_task(
                notify_catch_event_task, catch.user_id, "pb", "🎣 New personal best!",
                f"{catch.user.display_name} landed a personal best {catch.species.common_name}: {catch.weight} lb!",
            )
        else:
            background_tasks.add_task(
                notify_catch_event_task, catch.user_id, "catch", "New catch logged",
                f"{catch.user.display_name} logged a {catch.species.common_name}",
            )

        # Orthogonal to the record/pb/catch tier above — a catch can be both
        # a personal best AND a new challenge leader, so this is a second,
        # independent notification rather than another branch in the chain.
        challenge_result = check_challenge_leader(db, catch)
        if challenge_result.is_new:
            verb = (
                "takes the early lead in"
                if challenge_result.previous_holder_name is None
                else f"overtakes {challenge_result.previous_holder_name} for the lead in"
            )
            background_tasks.add_task(
                notify_catch_event_task, catch.user_id, "challenge_leader", "🥇 New challenge leader!",
                f"{catch.user.display_name} {verb} {challenge_result.challenge_name} with a "
                f"{catch.weight} lb {catch.species.common_name}!",
                "/leaderboard?tab=challenge",
            )
    except Exception:
        logger.exception("Record check failed for catch %s", catch.id)

    return CatchOut.model_validate(catch).model_copy(
        update={
            "is_personal_best": is_pb,
            "is_leaderboard_record": is_record,
            "previous_best_weight": previous_best_weight,
        }
    )

ALLOWED_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
}


def _get_owned_catch(catch_id: int, db: Session, current_user: User) -> Catch:
    catch = (
        db.query(Catch)
        .options(joinedload(Catch.species), joinedload(Catch.spot), joinedload(Catch.photos))
        .filter(Catch.id == catch_id)
        .first()
    )
    if not catch or catch.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catch not found")
    return catch


def _delete_photo_file(photo_url: str | None) -> None:
    if not photo_url:
        return
    filename = photo_url.rsplit("/", 1)[-1]
    path = Path(settings.upload_dir) / filename
    path.unlink(missing_ok=True)


@router.post("", response_model=CatchOut, status_code=status.HTTP_201_CREATED)
def create_catch(
    payload: CatchCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    species = db.get(Species, payload.species_id)
    if not species:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Species not found")

    catch = Catch(user_id=current_user.id, **payload.model_dump())
    try:
        catch.tide_height_ft, catch.tide_direction = get_tide_at(catch.caught_at)
    except TideUnavailable:
        pass  # best-effort — the catch still saves without tide data
    if catch.latitude is not None and catch.longitude is not None:
        catch.spot_id = find_spot_for_point(db, catch.latitude, catch.longitude)
    db.add(catch)
    db.commit()
    db.refresh(catch)
    return _check_records_and_notify(db, catch, background_tasks)


@router.get("/me", response_model=list[CatchOut])
def list_my_catches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Catch)
        .options(joinedload(Catch.species), joinedload(Catch.spot), joinedload(Catch.photos))
        .filter(Catch.user_id == current_user.id)
        .order_by(Catch.caught_at.desc())
        .all()
    )


@router.get("/recent", response_model=list[RecentCatch])
def list_recent_catches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catches = (
        db.query(Catch)
        .options(
            joinedload(Catch.species), joinedload(Catch.user), joinedload(Catch.spot), joinedload(Catch.photos)
        )
        .order_by(Catch.caught_at.desc())
        .limit(100)
        .all()
    )
    return [
        RecentCatch(
            id=c.id,
            user_id=c.user_id,
            display_name=c.user.display_name,
            weight=c.weight,
            length=c.length,
            caught_at=c.caught_at,
            photo_url=c.photo_url,
            photos=c.photos,
            latitude=c.latitude,
            longitude=c.longitude,
            species=c.species,
            tide_height_ft=c.tide_height_ft,
            tide_direction=c.tide_direction,
            spot=c.spot,
        )
        for c in catches
    ]


@router.get("/map", response_model=list[MapCatch])
def list_map_catches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catches = (
        db.query(Catch)
        .options(
            joinedload(Catch.species), joinedload(Catch.user), joinedload(Catch.spot), joinedload(Catch.photos)
        )
        .filter(Catch.latitude.isnot(None), Catch.longitude.isnot(None))
        .order_by(Catch.caught_at.desc())
        .all()
    )
    return [
        MapCatch(
            id=c.id,
            display_name=c.user.display_name,
            weight=c.weight,
            length=c.length,
            caught_at=c.caught_at,
            latitude=c.latitude,
            longitude=c.longitude,
            photo_url=c.photo_url,
            species=c.species,
            spot=c.spot,
        )
        for c in catches
    ]


@router.get("/{catch_id}", response_model=CatchOut)
def get_catch(
    catch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_owned_catch(catch_id, db, current_user)


@router.put("/{catch_id}", response_model=CatchOut)
def update_catch(
    catch_id: int,
    payload: CatchUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catch = _get_owned_catch(catch_id, db, current_user)

    updates = payload.model_dump(exclude_unset=True)
    if "species_id" in updates:
        species = db.get(Species, updates["species_id"])
        if not species:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Species not found")

    for field, value in updates.items():
        setattr(catch, field, value)

    if "caught_at" in updates:
        try:
            catch.tide_height_ft, catch.tide_direction = get_tide_at(catch.caught_at)
        except TideUnavailable:
            pass

    if "latitude" in updates or "longitude" in updates:
        catch.spot_id = (
            find_spot_for_point(db, catch.latitude, catch.longitude)
            if catch.latitude is not None and catch.longitude is not None
            else None
        )

    db.commit()
    db.refresh(catch)

    if "weight" in updates or "species_id" in updates:
        return _check_records_and_notify(db, catch, background_tasks)
    return catch


@router.delete("/{catch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catch(
    catch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catch = _get_owned_catch(catch_id, db, current_user)
    for p in catch.photos:
        _delete_photo_file(p.photo_url)
    db.delete(catch)
    db.commit()


@router.post("/{catch_id}/photos", response_model=CatchOut)
async def add_catch_photo(
    catch_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catch = _get_owned_catch(catch_id, db, current_user)

    if len(catch.photos) >= MAX_PHOTOS_PER_CATCH:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A catch can have at most {MAX_PHOTOS_PER_CATCH} photos",
        )

    ext = ALLOWED_PHOTO_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Photo must be JPEG, PNG, WEBP, or HEIC",
        )

    max_bytes = settings.max_upload_mb * 1024 * 1024
    contents = await file.read(max_bytes + 1)
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Photo must be under {settings.max_upload_mb}MB",
        )

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    (upload_dir / filename).write_bytes(contents)

    catch.photos.append(CatchPhoto(photo_url=f"/uploads/{filename}", position=len(catch.photos)))
    db.commit()
    db.refresh(catch)
    return catch


@router.delete("/{catch_id}/photos/{photo_id}", response_model=CatchOut)
def delete_catch_photo(
    catch_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catch = _get_owned_catch(catch_id, db, current_user)
    photo = next((p for p in catch.photos if p.id == photo_id), None)
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    _delete_photo_file(photo.photo_url)
    catch.photos.remove(photo)
    db.commit()
    db.refresh(catch)
    return catch
