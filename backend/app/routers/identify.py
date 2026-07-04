import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.identify import identify_species
from app.models import User
from app.rate_limit import limiter
from app.routers.catches import ALLOWED_PHOTO_TYPES
from app.schemas import IdentifyResult

router = APIRouter(prefix="/identify", tags=["identify"])


@router.post("", response_model=IdentifyResult)
@limiter.limit("20/hour")
async def identify(
    request: Request,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

    try:
        # identify_species() makes a multi-second blocking HTTP call to Claude via
        # the sync SDK client — run it off the event loop so one in-flight
        # identification doesn't freeze every other request on the server.
        species, raw_answer = await run_in_threadpool(
            identify_species, db, contents, file.content_type
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except anthropic.RateLimitError:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Species ID is rate-limited right now, try again in a moment",
        )
    except anthropic.APIStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Species ID failed: {e.message}",
        )
    except anthropic.APIConnectionError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach species ID service",
        )

    return IdentifyResult(species=species, raw_answer=raw_answer)
