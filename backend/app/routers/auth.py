import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, is_admin, verify_password
from app.config import settings
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
@limiter.limit("10/hour")
def signup(request: Request, payload: SignupRequest, db: Session = Depends(get_db)):
    # Constant-time compare — a plain `!=` short-circuits on the first
    # mismatched byte, which in theory leaks how many leading characters of
    # the invite code a guess got right via response timing.
    if not hmac.compare_digest(payload.invite_code, settings.invite_code):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invite code")

    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Display name required")

    existing = db.query(User).filter(User.display_name == display_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user = User(display_name=display_name, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        display_name=current_user.display_name,
        created_at=current_user.created_at,
        is_admin=is_admin(current_user),
        notification_mode=current_user.notification_mode,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/hour")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.display_name == payload.display_name.strip()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    return TokenResponse(access_token=create_access_token(user.id))
