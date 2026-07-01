from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    if payload.invite_code != settings.invite_code:
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
    return current_user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.display_name == payload.display_name.strip()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    return TokenResponse(access_token=create_access_token(user.id))
