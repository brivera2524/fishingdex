// Idempotent postinstall patch for leaflet-velocity 2.1.4.
//
// We deliberately do NOT use patch-package here. patch-package applies a
// unified diff whose context must match exactly, which deadlocks against
// Vercel's build cache: once a deploy caches an already-patched
// node_modules, a *changed* patch can no longer apply on top of it (its
// context lines were already rewritten by the previous patch), and every
// subsequent deploy restores that same poisoned cache and fails forever.
//
// String replacement is naturally idempotent instead — if a change is
// already present (pristine OR cached-and-patched), its `includes` check is
// false and we skip it. So this reaches the same end-state regardless of
// the starting state, immune to the cache problem.
//
// The two changes (see CurrentFlowLayer.tsx for the full rationale):
//   1. Redraw the flow field on `moveend` (fires once the view has actually
//      settled, inertia glide included) instead of `dragend` (fires while
//      the map is still gliding, drawing at a stale position).
//   2. Cut the hardcoded 750ms delay before drawing resumes after a view
//      change down to 120ms, so the flow snaps back nearly immediately.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(
  new URL("../node_modules/leaflet-velocity/dist/leaflet-velocity.js", import.meta.url),
);

const REPLACEMENTS = [
  {
    from: 'this._map.on("dragend", self._clearAndRestart);',
    to: 'this._map.on("moveend", self._clearAndRestart);',
  },
  {
    from: "}, 750); // showing velocity is delayed",
    to: "}, 120); // patched: snap back fast after a pan (see CurrentFlowLayer.tsx)",
  },
];

let src;
try {
  src = readFileSync(target, "utf8");
} catch {
  // Dependency not installed (e.g. a tooling-only install) — nothing to do.
  console.log("leaflet-velocity not present; skipping patch");
  process.exit(0);
}

let applied = 0;
let alreadyPresent = 0;
for (const { from, to } of REPLACEMENTS) {
  if (src.includes(from)) {
    src = src.replace(from, to);
    applied += 1;
  } else if (src.includes(to)) {
    alreadyPresent += 1;
  } else {
    // Neither the original nor our replacement is there — the upstream file
    // changed out from under us (e.g. a version bump). Fail loudly so it
    // gets noticed rather than silently shipping an unpatched animation.
    console.error(
      `patch-leaflet-velocity: could not find expected code to patch:\n  ${from}\n` +
        "leaflet-velocity may have changed version — update scripts/patch-leaflet-velocity.mjs.",
    );
    process.exit(1);
  }
}

if (applied > 0) {
  writeFileSync(target, src);
  console.log(`patched leaflet-velocity (${applied} change(s) applied, ${alreadyPresent} already present)`);
} else {
  console.log("leaflet-velocity already patched; nothing to do");
}
