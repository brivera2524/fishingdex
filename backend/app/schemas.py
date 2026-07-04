from datetime import datetime, timezone
from typing import Literal

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
    notification_mode: str = "off"

    _normalize_created_at = field_validator("created_at", mode="before")(_as_utc)


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


class NotificationModeUpdate(BaseModel):
    mode: Literal["all", "pb_and_record", "record_only", "off"]


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


class SpotSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class SpotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    polygon: list[list[float]] = Field(min_length=3)


class SpotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    parking_lat: float | None = None
    parking_lng: float | None = None


class SpotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    polygon: list[list[float]]
    centroid_lat: float
    centroid_lng: float
    parking_lat: float | None = None
    parking_lng: float | None = None
    created_at: datetime

    _normalize_created_at = field_validator("created_at", mode="before")(_as_utc)


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
    spot: SpotSummary | None = None
    # Excludes this catch from leaderboards, PB/record detection, and angler
    # catch/species counts while still showing normally in the dex, map, and
    # "my catches" views — see Catch.counts_for_leaderboard on the model.
    counts_for_leaderboard: bool = True
    # Response-only — describes a point-in-time fact about the save that just
    # happened (used to trigger a celebration animation for the catcher), not
    # persisted on the Catch model.
    is_personal_best: bool = False
    is_leaderboard_record: bool = False
    # The weight this catch just beat, whenever is_personal_best or
    # is_leaderboard_record is true — lets the client show "beat previous by
    # X lb" instead of a bare congratulations.
    previous_best_weight: float | None = None

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
    tide_height_ft: float | None = None
    tide_direction: str | None = None
    spot: SpotSummary | None = None

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
    tide_height_ft: float | None = None
    tide_direction: str | None = None
    species: SpeciesOut
    spot: SpotSummary | None = None

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
    spot: SpotSummary | None = None

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
