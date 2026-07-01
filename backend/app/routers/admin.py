from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.identify import ALLOWED_MODELS, MODEL_SETTING_KEY, get_active_model
from app.models import AppSetting, User
from app.schemas import AdminSettingsOut, AdminSettingsUpdate

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/settings", response_model=AdminSettingsOut)
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    return AdminSettingsOut(model=get_active_model(db), available_models=ALLOWED_MODELS)


@router.put("/settings", response_model=AdminSettingsOut)
def update_settings(
    payload: AdminSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    if payload.model not in ALLOWED_MODELS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported model")

    setting = db.get(AppSetting, MODEL_SETTING_KEY)
    if setting:
        setting.value = payload.model
    else:
        db.add(AppSetting(key=MODEL_SETTING_KEY, value=payload.model))
    db.commit()

    return AdminSettingsOut(model=payload.model, available_models=ALLOWED_MODELS)
