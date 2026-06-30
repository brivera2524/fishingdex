# Fish Pokedex — Project Roadmap

A San Diego inshore fishing tracker, Pokedex-style: catch fish, fill in your dex, compete with buddies.

---

## 0. Decisions to lock in before scaffolding

These choices ripple through everything else, so nail them down first.

- **Tech stack.** Recommendation given your background: **FastAPI (Python) backend + React PWA frontend + Postgres**. You already think in Python, and FastAPI gets you auto-generated OpenAPI docs and async support almost for free. SQLite is fine for local dev / very early MVP, but move to Postgres once geolocation queries and multi-user data show up — Postgres has native geo extensions (PostGIS) if you ever want real "nearest species" math instead of a lookup table.
- **Hosting.** Something cheap/free to start: Railway or Render for the backend + Postgres, Vercel or Netlify for the static PWA frontend. Avoid AWS/GCP complexity until you actually need it.
- **Scope of "buddies."** Is this just you and a handful of friends (so a shared invite code / allowlist is enough), or could it grow? This affects how much you invest in auth (see Phase 1).
- **Species list size.** "Nearly all fish in San Diego" — are we talking the ~30-50 species an inshore angler realistically encounters, or a more exhaustive marine list (200+)? Start narrow (inshore/pier/jetty species you and your buddies actually target) and expand later. A focused dex with good data beats a sprawling one that's half-empty.

---

## 1. Feature feasibility tiers

| Tier | Feature | Why |
|---|---|---|
| **Easy — build first** | Manual catch entry (species, weight, length, location, date, photo) | Standard CRUD form |
| **Easy** | Species database (habitat, size range, season, description) | Static reference data, you curate it once |
| **Easy** | PWA installability (add to home screen) | Just a manifest.json + service worker, no native app needed |
| **Easy** | Per-user data persistence | Standard DB schema, one-to-many users→catches |
| **Medium** | Light auth (no personal info, just enough to gate access) | Magic link or simple username/passcode, no need for full OAuth |
| **Medium** | Pokedex-style UI (caught = full image, uncaught = silhouette) | CSS/JS toggle based on whether user has a catch record for that species |
| **Medium** | Geolocation → nearby likely species | Needs a spot↔species mapping table you build by hand from your own fishing knowledge — not actually hard, just data-entry work |
| **Hard — separate track** | Camera-based species ID with "discovery" animation | Real ML problem: needs either an existing vision API or a trained/fine-tuned classifier, plus a labeled photo dataset |

---

## 2. Suggested build order (phases)

### Phase 1 — Core MVP (manual dex, no ML)
**Goal: something you and your buddies can actually use to log catches within a few weeks.**

- Set up FastAPI backend + Postgres, deploy skeleton to Railway/Render
- Set up React PWA frontend (Vite + manifest.json + service worker), deploy to Vercel
- Auth: simplest viable option — e.g. email magic link (no passwords to manage) or even a shared invite-code + username scheme since you explicitly don't want to store real personal info. Look at something like Lucia or a minimal JWT setup rather than a heavyweight auth provider.
- Data model (see section 3 below)
- Manual catch entry form: species (dropdown from species table), weight, length, date/time, location (text or lat/lng), notes, photo upload
- Basic "my catches" log view
- Species database: seed ~30-50 SD inshore species with habitat, typical size, season, a stock photo, and a short blurb. This is mostly data entry — could even use Claude to help you draft the blurbs from reputable sources, then you fact-check.

**Deliverable:** a working PWA where you can log a fish, see your catch history, and browse a static species reference.

### Phase 2 — The Pokedex feel
**Goal: make it actually feel like a Pokedex, not a spreadsheet with extra steps.**

- Dex grid view: every species in the DB shown as a card. If the logged-in user has ≥1 catch of that species → full-color image + stats. If not → grayed-out silhouette with just the name (or "???").
- Per-user completion stats ("23/45 species caught")
- Catch detail page per species (your personal catches of that species, biggest, most recent, etc.)
- Basic leaderboard/comparison between buddies if you want the social layer (most species caught, biggest fish, etc.) — easy add since data's already per-user

### Phase 3 — Geolocation-aware nearby species
**Goal: "you're at Quivira Jetty, here's what's likely biting."**

- Build a `spots` table: named fishing locations with lat/lng + radius, each spot linked to likely species (and ideally season/tide notes if you want to get fancy later)
- On load (with permission), get user's geolocation, find nearest known spot within some radius, surface its associated species list
- This is **just data + a distance calculation** — no ML needed. The "intelligence" here is really your own fishing knowledge encoded into a table. Worth spending real time getting this list right since it's high-value and low-complexity.
- Stretch: tie in tide/season data via a public NOAA tide API to refine "likely now" vs just "likely at this spot ever"

### Phase 4 — Vision-based species ID (the hard one)
**Goal: scan a fish, get an ID, watch the discovery animation.**

Don't build a custom model first — validate the concept cheaply, then decide if custom training is worth it.

- **Step A (fast, cheap, good enough to ship):** Send the photo to a multimodal vision API (e.g. the Claude API, which you're already using for study_bug) with a prompt constrained to your species list — "which of these N San Diego species is in this photo, or none." This gets you a working "scan" feature in days, not months, and works surprisingly well for visually distinct species. Build the discovery animation against this first, since the UX is the same regardless of what's powering the ID underneath.
- **Step B (only if Step A's accuracy or cost becomes a problem):** Collect your own labeled photo dataset — every catch photo you and your buddies upload becomes training data over time, especially if Step A's guesses get a thumbs-up/thumbs-down confirmation step from the user. Once you have a few hundred photos per species, fine-tune a small image classifier (transfer learning on top of a pretrained model like MobileNet or EfficientNet — lightweight enough to even consider running client-side eventually). This is a real ML project in its own right, worth treating as separate from the main app timeline.
- Decouple this from the core app: the "scan" feature should call out to whichever backend (API or self-hosted model) and just needs a species name + confidence back. Swapping Step A for Step B later shouldn't require touching the rest of the app.

---

## 3. Rough data model

```
users
  id, display_name, created_at  (no PII — just what's needed to scope data per user)

species
  id, common_name, scientific_name, habitat_description,
  typical_size_range, season_notes, image_url, silhouette_url

spots
  id, name, latitude, longitude, radius_meters

spot_species  (many-to-many)
  spot_id, species_id, likelihood_notes

catches
  id, user_id, species_id, weight, length, caught_at,
  latitude, longitude, photo_url, notes
```

This is intentionally simple — normalize further only if a real need shows up (e.g. tide/weather conditions per catch).

---

## 4. Open questions worth answering early

- How many buddies, roughly? Changes how much auth/infra investment is worth it.
- Do you want this public-facing at all, or strictly private to your group? Affects whether species photos need to be your own (copyright-safe) or can be pulled from elsewhere.
- Is the leaderboard/social/competitive angle something you actually want, or is this primarily a personal log? Worth deciding before Phase 2 since it shapes the data model (do catches need to be visible to other users by default?).
- For the vision feature — are you OK with "good enough" API-based ID long-term, or is training your own model part of the appeal of the project itself (i.e., is this partly a portfolio piece for your job search, given your ML interest)?

---

## 5. Suggested first sprint

If you want a concrete starting point: scaffold the FastAPI backend with the `users`, `species`, and `catches` tables, seed 10-15 species you and your buddies actually catch, and build the manual entry form + basic catch log. That alone is a usable v0 and gives you a real skeleton to layer everything else onto.
