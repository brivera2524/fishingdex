from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    catches: Mapped[list["Catch"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Species(Base):
    __tablename__ = "species"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    common_name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    scientific_name: Mapped[str | None] = mapped_column(String(150))
    habitat_description: Mapped[str | None] = mapped_column(Text)
    typical_size_range: Mapped[str | None] = mapped_column(String(100))
    season_notes: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    silhouette_url: Mapped[str | None] = mapped_column(String(500))
    # Visual diagnostic text fed to the camera-ID classifier prompt. Separate from
    # habitat_description (public-facing) since this is written for the model, not anglers.
    classifier_description: Mapped[str | None] = mapped_column(Text)

    catches: Mapped[list["Catch"]] = relationship(back_populates="species")


class Catch(Base):
    __tablename__ = "catches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    species_id: Mapped[int] = mapped_column(ForeignKey("species.id"), index=True, nullable=False)

    # Plain indexed numeric/timestamp columns so leaderboard aggregates (MAX/GROUP BY)
    # work without a schema change later.
    weight: Mapped[float | None] = mapped_column(Float, index=True)
    length: Mapped[float | None] = mapped_column(Float, index=True)
    caught_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)

    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="catches")
    species: Mapped["Species"] = relationship(back_populates="catches")
