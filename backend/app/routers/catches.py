import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Catch, Species, User
from app.schemas import CatchCreate, CatchOut, CatchUpdate, MapCatch, RecentCatch

router = APIRouter(prefix="/catches", tags=["catches"])

ALLOWED_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
}


def _get_owned_catch(catch_id: int, db: Session, current_user: User) -> Catch:
    catch = (
        db.query(Catch)
        .options(joinedload(Catch.species))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    species = db.get(Species, payload.species_id)
    if not species:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Species not found")

    catch = Catch(user_id=current_user.id, **payload.model_dump())
    db.add(catch)
    db.commit()
    db.refresh(catch)
    return catch


@router.get("/me", response_model=list[CatchOut])
def list_my_catches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Catch)
        .options(joinedload(Catch.species))
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
        .options(joinedload(Catch.species), joinedload(Catch.user))
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
            latitude=c.latitude,
            longitude=c.longitude,
            species=c.species,
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
        .options(joinedload(Catch.species), joinedload(Catch.user))
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

    db.commit()
    db.refresh(catch)
    return catch


@router.delete("/{catch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catch(
    catch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catch = _get_owned_catch(catch_id, db, current_user)
    _delete_photo_file(catch.photo_url)
    db.delete(catch)
    db.commit()


@router.post("/{catch_id}/photo", response_model=CatchOut)
async def upload_catch_photo(
    catch_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catch = _get_owned_catch(catch_id, db, current_user)

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

    _delete_photo_file(catch.photo_url)

    filename = f"{uuid.uuid4().hex}{ext}"
    (upload_dir / filename).write_bytes(contents)

    catch.photo_url = f"/uploads/{filename}"
    db.commit()
    db.refresh(catch)
    return catch


@router.delete("/{catch_id}/photo", response_model=CatchOut)
def delete_catch_photo(
    catch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    catch = _get_owned_catch(catch_id, db, current_user)
    _delete_photo_file(catch.photo_url)
    catch.photo_url = None
    db.commit()
    db.refresh(catch)
    return catch
