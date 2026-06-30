from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Species
from app.schemas import SpeciesOut

router = APIRouter(prefix="/species", tags=["species"])


@router.get("", response_model=list[SpeciesOut])
def list_species(db: Session = Depends(get_db)):
    return db.query(Species).order_by(Species.common_name).all()
