from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _as_utc(value: datetime | None) -> datetime | None:
    # SQLite drops tzinfo on round-trip, so naive datetimes read back from the
    # DB are UTC in fact but not in name. Without this, naive ISO strings get
    # serialized without a 'Z'/offset and JS `new Date(...)` parses them as
    # local time, shifting displayed times by the client's UTC offset.
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class SignupRequest(BaseModel):
    invite_code: str
    display_name: str
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    display_name: str
    password: str = Field(min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    display_name: str
    created_at: datetime
    is_admin: bool = False

    _normalize_created_at = field_validator("created_at", mode="before")(_as_utc)


class SpeciesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    common_name: str
    scientific_name: str | None = None
    habitat_description: str | None = None
    typical_size_range: str | None = None
    season_notes: str | None = None
    image_url: str | None = None
    silhouette_url: str | None = None
    min_size: str | None = None
    bag_limit: str | None = None
    regulation_notes: str | None = None


class CatchCreate(BaseModel):
    species_id: int
    weight: float | None = None
    length: float | None = None
    caught_at: datetime
    latitude: float | None = None
    longitude: float | None = None
    photo_url: str | None = None
    notes: str | None = None


class CatchUpdate(BaseModel):
    species_id: int | None = None
    weight: float | None = None
    length: float | None = None
    caught_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    notes: str | None = None


class CatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    species_id: int
    weight: float | None = None
    length: float | None = None
    caught_at: datetime
    latitude: float | None = None
    longitude: float | None = None
    photo_url: str | None = None
    notes: str | None = None
    created_at: datetime
    species: SpeciesOut
    tide_height_ft: float | None = None
    tide_direction: str | None = None

    _normalize_caught_at = field_validator("caught_at", mode="before")(_as_utc)
    _normalize_created_at = field_validator("created_at", mode="before")(_as_utc)


class IdentifyResult(BaseModel):
    species: SpeciesOut | None
    raw_answer: str


class LeaderboardCatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    weight: float | None = None
    length: float | None = None
    caught_at: datetime
    photo_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None

    _normalize_caught_at = field_validator("caught_at", mode="before")(_as_utc)


class SpeciesRecord(BaseModel):
    species: SpeciesOut
    catch_count: int
    top_catch: LeaderboardCatch | None = None


class AnglerStat(BaseModel):
    display_name: str
    catch_count: int
    species_count: int


class UserStat(BaseModel):
    id: int
    display_name: str
    catch_count: int
    species_count: int


class RecentCatch(BaseModel):
    id: int
    user_id: int
    display_name: str
    weight: float | None = None
    length: float | None = None
    caught_at: datetime
    photo_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    species: SpeciesOut

    _normalize_caught_at = field_validator("caught_at", mode="before")(_as_utc)


class MapCatch(BaseModel):
    id: int
    display_name: str
    weight: float | None = None
    length: float | None = None
    caught_at: datetime
    latitude: float
    longitude: float
    photo_url: str | None = None
    species: SpeciesOut

    _normalize_caught_at = field_validator("caught_at", mode="before")(_as_utc)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    id: int
    catch_id: int
    user_id: int
    display_name: str
    body: str
    created_at: datetime
    updated_at: datetime | None = None

    _normalize_created_at = field_validator("created_at", mode="before")(_as_utc)
    _normalize_updated_at = field_validator("updated_at", mode="before")(_as_utc)


class AdminSettingsOut(BaseModel):
    model: str
    available_models: list[str]


class AdminSettingsUpdate(BaseModel):
    model: str
