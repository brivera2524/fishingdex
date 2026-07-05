from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # "all" | "pb_and_record" | "record_only" | "off". Defaults to "off" —
    # push notifications are opt-in, not the other way around.
    notification_mode: Mapped[str] = mapped_column(String(20), default="off", nullable=False)
    # A real column rather than a hardcoded "user id 1 is the admin" check —
    # lets admin status move to (or be shared with) a different account
    # without a code change. Granted via a one-off script (see
    # app/scripts/grant_admin.py), not through any API — there's no user
    # management UI, and there doesn't need to be for a friend-group app.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Excludes this account from the anglers roster (GET /users) and the
    # angler leaderboard — for a dev/test account that shouldn't clutter the
    # friend group's actual roster. Their catches are unaffected elsewhere
    # (map, dex, species leaderboards) unless also excluded via
    # counts_for_leaderboard. Set via app/scripts/hide_from_anglers.py.
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    catches: Mapped[list["Catch"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    push_subscriptions: Mapped[list["PushSubscription"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


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
    # CA DFW regulations for San Diego waters. Stored as strings since limits mix
    # numbers with values like "No Limit" and sizes are written as "14 inches".
    min_size: Mapped[str | None] = mapped_column(String(50))
    bag_limit: Mapped[str | None] = mapped_column(String(50))
    regulation_notes: Mapped[str | None] = mapped_column(Text)

    catches: Mapped[list["Catch"]] = relationship(back_populates="species")


class Spot(Base):
    """A named, hand-drawn fishing location (e.g. "Harbor Island"), curated
    by the admin. Catches inside its polygon are auto-attributed to it."""

    __tablename__ = "spots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # [[lat, lng], ...] in drawn order — the polygon implicitly closes from
    # the last point back to the first.
    polygon: Mapped[list] = mapped_column(JSON, nullable=False)
    # Stored (not recomputed on read) since the wind lookup needs a stable
    # point on every page load — an area-weighted centroid, not a naive
    # vertex average, so a lopsided hand-drawn shape doesn't drift off-center.
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lng: Mapped[float] = mapped_column(Float, nullable=False)
    # Manually pinned by the admin — where to actually send someone who wants
    # to drive there (e.g. the parking lot), which often isn't the polygon's
    # centroid (that can land in the water for a shoreline/pier spot). Falls
    # back to the centroid when unset.
    parking_lat: Mapped[float | None] = mapped_column(Float)
    parking_lng: Mapped[float | None] = mapped_column(Float)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    catches: Mapped[list["Catch"]] = relationship(back_populates="spot")


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
    notes: Mapped[str | None] = mapped_column(Text)

    # Computed server-side from NOAA's San Diego tide predictions at
    # caught_at, not user-supplied. Nullable since older catches are
    # backfilled separately and a NOAA hiccup shouldn't block saving a catch.
    tide_height_ft: Mapped[float | None] = mapped_column(Float)
    tide_direction: Mapped[str | None] = mapped_column(String(10))

    # Computed server-side by testing (latitude, longitude) against each
    # spot's drawn polygon at save time. Nullable — most catches aren't
    # inside any curated spot, and older catches are backfilled separately.
    spot_id: Mapped[int | None] = mapped_column(ForeignKey("spots.id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Lets a catch keep its map pin, photo, and dex/collection value while
    # being excluded from every cross-user ranking (leaderboards, PB/record
    # detection, angler catch/species counts) — e.g. seed/test data logged
    # while building out the app, which shouldn't count against anyone's
    # real fishing. Defaults true so this is opt-out, not opt-in.
    counts_for_leaderboard: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="catches")
    species: Mapped["Species"] = relationship(back_populates="catches")
    spot: Mapped["Spot | None"] = relationship(back_populates="catches")
    comments: Mapped[list["Comment"]] = relationship(back_populates="catch", cascade="all, delete-orphan")
    photos: Mapped[list["CatchPhoto"]] = relationship(
        back_populates="catch", cascade="all, delete-orphan", order_by="CatchPhoto.position"
    )

    @property
    def photo_url(self) -> str | None:
        """The primary (lowest-position) photo, for callers that only want a
        single thumbnail — e.g. Pydantic's from_attributes reading CatchOut's
        scalar photo_url field straight off this model."""
        return self.photos[0].photo_url if self.photos else None


class CatchPhoto(Base):
    __tablename__ = "catch_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catch_id: Mapped[int] = mapped_column(ForeignKey("catches.id"), index=True, nullable=False)
    photo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    # Upload order — lets a catch have a stable "primary" photo (position 0)
    # for list-view thumbnails without a separate is_primary flag.
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    catch: Mapped["Catch"] = relationship(back_populates="photos")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catch_id: Mapped[int] = mapped_column(ForeignKey("catches.id"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    catch: Mapped["Catch"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship()


class PushSubscription(Base):
    """One browser/device's Web Push subscription. Keyed by endpoint (not
    user_id + endpoint) so re-subscribing on a shared device correctly hands
    the row over to whichever friend is currently logged in there, rather
    than accumulating duplicates."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    endpoint: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="push_subscriptions")


class AppSetting(Base):
    """Tiny key/value store for admin-tunable runtime settings (e.g. which
    Claude model /identify uses). Not worth a dedicated table per setting
    given how few of these exist."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(String(200), nullable=False)
