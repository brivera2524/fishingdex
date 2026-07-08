from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Species, User
from app.schemas import SpeciesCreate, SpeciesOut

router = APIRouter(prefix="/species", tags=["species"])


@router.get("", response_model=list[SpeciesOut])
def list_species(db: Session = Depends(get_db)):
    return db.query(Species).order_by(Species.common_name).all()


@router.post("", response_model=SpeciesOut, status_code=status.HTTP_201_CREATED)
def create_species(
    payload: SpeciesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    common_name = payload.common_name.strip()
    if not common_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Species name is required")

    existing = db.query(Species).filter(func.lower(Species.common_name) == common_name.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f'"{existing.common_name}" is already in the list')

    scientific_name = payload.scientific_name.strip() if payload.scientific_name else None
    species = Species(common_name=common_name, scientific_name=scientific_name)
    db.add(species)
    db.commit()
    db.refresh(species)
    return species
