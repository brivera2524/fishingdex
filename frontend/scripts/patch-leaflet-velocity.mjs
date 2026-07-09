// Copies our vendored, fully-patched leaflet-velocity.js over the installed
// copy -- a plain overwrite, not a diff/patch.
//
// We deliberately don't use patch-package (diff-based patching) or
// string-replacement-on-top-of-whatever's-there. Both depend on the
// installed file being in a *known* state before editing it, and Vercel's
// build cache can hand back a node_modules/leaflet-velocity that was
// already patched by an *older* version of this file (from a previous
// deploy's cached install) -- at that point a diff's context no longer
// matches, and even a string-replace's "from" text may no longer be
// present, so every subsequent deploy restores that same stale, wrongly-
// patched cache and fails identically. This bit us three separate times
// (see git history around 2026-07-09/10) while iterating on this file's
// drag-persistence behavior.
//
// A wholesale copy has no such dependency: `vendor/leaflet-velocity.patched.js`
// is the single source of truth for what this file should contain, and this
// script always produces exactly that, regardless of whatever was cached.
// To change the patch, edit the vendored file directly (it's a full copy of
// node_modules/leaflet-velocity/dist/leaflet-velocity.js, not a diff) and
// this script will apply it identically on every install.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../vendor/leaflet-velocity.patched.js", import.meta.url));
const target = fileURLToPath(
  new URL("../node_modules/leaflet-velocity/dist/leaflet-velocity.js", import.meta.url),
);

if (!existsSync(target)) {
  // Dependency not installed (e.g. a tooling-only install) -- nothing to do.
  console.log("leaflet-velocity not present; skipping patch");
  process.exit(0);
}

copyFileSync(source, target);
console.log("leaflet-velocity patched (vendored copy applied)");
