"""Point-in-polygon and centroid helpers for curated fishing spots.

Pure Python (no shapely/geoalchemy2) — at San Diego's scale, plain lat/lng
ray casting is accurate enough and there's no antimeridian to worry about,
so a geo dependency isn't worth adding for a handful of hand-drawn polygons.
"""

from sqlalchemy.orm import Session

from app.models import Spot


def point_in_polygon(lat: float, lng: float, polygon: list[list[float]]) -> bool:
    """Ray-casting test. `polygon` is [[lat, lng], ...] and implicitly closes
    from the last point back to the first."""
    inside = False
    n = len(polygon)
    for i in range(n):
        lat1, lng1 = polygon[i]
        lat2, lng2 = polygon[(i + 1) % n]
        if (lng1 > lng) != (lng2 > lng):
            lat_at_lng = lat1 + (lat2 - lat1) * (lng - lng1) / (lng2 - lng1)
            if lat < lat_at_lng:
                inside = not inside
    return inside


def polygon_centroid(polygon: list[list[float]]) -> tuple[float, float]:
    """Area-weighted centroid (the standard shoelace-formula centroid), not a
    naive vertex average — a lopsided hand-drawn polygon would otherwise drift
    visibly off-center."""
    area = 0.0
    cx = 0.0
    cy = 0.0
    n = len(polygon)
    for i in range(n):
        lat1, lng1 = polygon[i]
        lat2, lng2 = polygon[(i + 1) % n]
        cross = lat1 * lng2 - lat2 * lng1
        area += cross
        cx += (lat1 + lat2) * cross
        cy += (lng1 + lng2) * cross
    area /= 2
    if area == 0:
        # Degenerate polygon (e.g. all points collinear) — fall back to a
        # plain vertex average rather than dividing by zero.
        avg_lat = sum(p[0] for p in polygon) / n
        avg_lng = sum(p[1] for p in polygon) / n
        return avg_lat, avg_lng
    cx /= 6 * area
    cy /= 6 * area
    return cx, cy


def find_spot_for_point(db: Session, lat: float, lng: float) -> int | None:
    """Returns the first spot whose polygon contains (lat, lng), or None.
    Spots aren't expected to overlap — if they do, the lower spot id wins and
    that's not worth tie-breaking for a handful of curated locations."""
    for spot in db.query(Spot).order_by(Spot.id).all():
        if point_in_polygon(lat, lng, spot.polygon):
            return spot.id
    return None
