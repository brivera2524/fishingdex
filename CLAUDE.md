# Fish Pokedex — Project Context

A Pokedex-style fishing tracker for a small friend group (5-10 users) to log fish they catch around San Diego.

## Stack
- Backend: FastAPI (Python)
- Frontend: React + Vite, built as an installable PWA (manifest.json + service worker) — no app store, add-to-homescreen only
- Database: Postgres (SQLite acceptable for local dev only)
- Hosting target: Railway or Render (backend + DB), Vercel or Netlify (frontend)

## Scale & auth context
- 5-10 known users, all real-world friends — not a public product
- Auth should be lightweight: no personal info stored beyond a display name. Magic-link email or a shared invite-code + username scheme is sufficient. Do not build a heavyweight auth system.

## Product shape
Core loop: user manually logs a catch (species, weight, length, date, location, photo) → it fills in their personal "dex" → dex view shows caught species in full color, uncaught species as a grayed-out silhouette.

Future (not this phase, but design the schema to support it without migration):
- Leaderboards: biggest catch per species (all-time and monthly), most species caught, etc.
- Keep `weight`, `length`, and `caught_at` as plain indexed numeric/timestamp columns on `catches` so these are simple aggregate queries later (MAX/GROUP BY) — no schema redesign needed when we add this.

Later phases (see docs/roadmap.md for full detail, not needed for this session):
- Geolocation-based "nearby likely species" — a manually curated spots↔species (`spot_species`) matching table, no ML. Still deferred — distinct from the `spots` table below, which is already built.
- Camera-based species ID — a separate track, starts with calling a vision API rather than training a custom model. Don't build this yet.

## Spots (added post-Phase-1)
Admin-curated named fishing locations (e.g. "Harbor Island"), drawn as a
polygon directly on the Map page. Any catch logged with lat/lng inside a
spot's boundary is auto-attributed to it (point-in-polygon, no geo
dependency — see `backend/app/geo.py`). Every user sees each spot's outline
plus a tappable wind badge (current speed/direction via Open-Meteo, fetched
client-side) and its recent catches. This is unrelated to the deferred
`spot_species` matching table above.

## Data model (Phase 1)

```
users
  id, display_name, created_at

species
  id, common_name, scientific_name, habitat_description,
  typical_size_range, season_notes, image_url, silhouette_url

catches
  id, user_id (FK), species_id (FK), weight, length, caught_at,
  latitude, longitude, photo_url, notes, spot_id (FK, nullable)

spots
  id, name, polygon (JSON [[lat,lng],...]), centroid_lat, centroid_lng,
  created_by_user_id (FK), created_at
```

(`spot_species` — the ML-free nearby-species-matching table — is still a later phase, not built.)

## Conventions
- Keep the vision/ML feature fully decoupled — nothing in Phase 1 should assume it exists.
- Prefer boring, simple solutions over flexible/generic ones given the small user base.
- Full roadmap with phase-by-phase detail lives in docs/roadmap.md — consult it for context on what's coming, but only build what's explicitly scoped in the current task.
