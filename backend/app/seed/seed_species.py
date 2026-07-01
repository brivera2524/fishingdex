"""Seed the species table.

Fill in SPECIES below (common_name is required; the rest is optional but
recommended) then run:

    python -m app.seed.seed_species

Re-running is safe — existing species (matched by common_name) are updated
in place rather than duplicated.
"""

from app.database import SessionLocal
from app.models import Species

SPECIES: list[dict] = [
{
        "common_name": "Spotted Bay Bass",
        "scientific_name": "Paralabrax maculatofasciatus",
        "habitat_description": "Shallow bays and harbors, eelgrass beds, docks, and mudflats",
        "typical_size_range": "8-18 in",
        "season_notes": "Year-round, peaks in warmer months",
        "min_size": "14 inches",
        "bag_limit": "5",
        "regulation_notes": "Limit of 5 is in combination with Barred Sand Bass and Kelp (Calico) Bass.",
        "classifier_description": (
            "Sleek bass body shape with an elongated third top spine. STEP 1 — CHECK FOR DENSE ROUND "
            "FRECKLING, BEFORE LOOKING AT BARS: the head, cheeks, gill cover, flanks, and belly are "
            "densely covered edge-to-edge in small, round, evenly-spaced dark brown or black freckles "
            "(polka-dots), like the fish was sprinkled with pepper. The FACE/CHEEK is the single most "
            "reliable place to check, because it carries no bars to confuse the pattern with — if the "
            "face and cheek are visible in the photo, judge from there first. If the face is hidden, "
            "obscured, or angled away (e.g. fish held by the lower jaw facing away from camera), fall "
            "back to checking the flanks and belly instead — the same dense, uniform, evenly-spaced dot "
            "pattern there is equally diagnostic, it's just more prone to being mistaken for shadow "
            "between bars, so weigh it slightly less confidently than a clear facial view. This dense "
            "spotting (wherever it's visible) is the single most reliable feature for this species and "
            "OVERRIDES any bar pattern. DO NOT let vertical bars override this — Spotted Bay Bass very "
            "commonly ALSO have bold dark vertical bars on the body in addition to their spots, so bars "
            "alone prove nothing. DECISION RULE: if dense round freckling is visible anywhere on the "
            "fish — face, cheek, flank, or belly — this is a Spotted Bay Bass, full stop — even if "
            "strong vertical bars are also clearly visible. STEP 2 — RULE OUT SCULPIN BEFORE "
            "FINALIZING: Spotted Bay Bass has smooth, unarmored skin, a sleek narrow head, and no fleshy "
            "skin tabs/flaps anywhere on the head or jaw. Its dots are small, round, uniform in size, "
            "and evenly spaced, like stippling — NOT an uneven blotchy patchwork. DO NOT use a raised, "
            "spiky-looking dorsal fin as evidence of Sculpin — Spotted Bay Bass (like all Paralabrax "
            "bass) has its own spiny anterior dorsal fin that stands fully erect when the fish is held "
            "or handled; this is normal bass anatomy, not a sculpin-exclusive trait, so 'visible spines "
            "on the fin' should NOT push the call toward Sculpin. Likewise, DO NOT weight overall body "
            "color/tone (grey vs. olive vs. brown vs. tan) — coloring varies with habitat and lighting "
            "and is not diagnostic between these species. Only two things separate them: (1) head "
            "armor — bony ridges or small fleshy tabs/flaps sticking out near the eyes/mouth means "
            "Sculpin, a smooth unarmored head means Spotted Bay Bass; and (2) pattern geometry — small "
            "uniform evenly-spaced round dots means Spotted Bay Bass, an uneven blotchy camouflage wash "
            "means Sculpin. If neither head armor nor blotchy patchwork is present, do not reclassify "
            "as Sculpin just because the dorsal fin is spiky or the fish looks brownish. Spotted Bay "
            "Bass also has smaller, more angular, pointed pectoral (side) fins, unlike Sculpin's large, "
            "round, pleated fan-like pectoral fins. COMMONLY "
            "CONFUSED WITH: Barred Sand Bass (which is comparatively CLEAN and unfreckled everywhere, "
            "not just the face — check the whole body for freckling, not just the bars, to tell them "
            "apart) and Sculpin (rough, spiny, armored HEAD with blotchy camouflage instead of small "
            "uniform round dots — judge by head armor and dot geometry only, never by fin spikiness or "
            "color)."
        ),
    },
    {
        "common_name": "Calico Bass",
        "scientific_name": "Paralabrax clathratus",
        "habitat_description": "Kelp beds, rocky reefs, and structure near the coast",
        "typical_size_range": "10-20 in",
        "season_notes": "Year-round, best late spring through fall",
        "min_size": "14 inches",
        "bag_limit": "5",
        "regulation_notes": "Limit of 5 is in combination with Spotted and Barred Sand Bass.",
        "classifier_description": (
            "Thick, heavy bass body. CRITICAL FEATURES: Distinct 'checkerboard' pattern of square-ish "
            "white and olive-brown blotches covering the body. It completely lacks vertical stripes or "
            "solid bars. The third spine on the top fin is roughly the same length as the fourth and "
            "fifth spines. KEY DIAGNOSTIC AGAINST SCULPIN — TRUE WHITE COLORING: Calico Bass blotches "
            "include genuinely WHITE or pale patches contrasting against the darker olive-brown blotches "
            "— real white, not just a lighter shade of tan/brown. This true white-and-dark contrast is "
            "present even on smaller fish where the checkerboard squares themselves are less crisp or "
            "less regularly shaped — so on a smaller or less clearly-checkered fish, look for any true "
            "white patches rather than relying on the pattern forming clean squares. Sculpin does NOT "
            "have true white patches — its camouflage stays entirely within a warm red/orange/brown "
            "range, just in darker and lighter shades of those warm tones, never true white. If you see "
            "distinct white or pale-white blotches anywhere on the body, it is Calico Bass, not Sculpin, "
            "regardless of how irregular or non-checkerboard the pattern looks. Calico Bass also has "
            "smooth, unarmored skin and a small sleek head with no bony ridges, no spines, and no fleshy "
            "skin tabs anywhere on the head or jaw, and smaller, pointed pectoral fins rather than "
            "Sculpin's large round pleated fan-like pectoral fins. If the head is smooth and unarmored, "
            "it is NOT a Sculpin, regardless of how blotchy, checkered, or irregular the body pattern "
            "looks. COMMONLY CONFUSED WITH: Barred Sand Bass and Spotted Bay Bass. DIFFERENTIATION: "
            "Calico Bass has square blotches instead of vertical bars, and its top fin is relatively "
            "flat, lacking the massively elongated third-spine spike found on both Sand Bass and Spotted "
            "Bay Bass."
        )
    },
    {
        "common_name": "Barred Sand Bass",
        "scientific_name": "Paralabrax nebulifer",
        "habitat_description": "Sandy bottoms near structure, bays, and nearshore flats",
        "typical_size_range": "10-22 in",
        "season_notes": "Summer spawning aggregations, year-round otherwise",
        "min_size": "14 inches",
        "bag_limit": "5",
        "regulation_notes": "Limit of 5 is in combination with Spotted and Kelp (Calico) Bass.",
        "classifier_description": (
            "High-backed bass body with a grey, whitish, or olive background, dominated by thick, "
            "distinct dark vertical 'jail bars' running down the sides, and a dramatically elongated "
            "3rd dorsal spine standing up like a tall spike. STEP 1 — CHECK FOR CLEAN, UNFRECKLED SKIN, "
            "BEFORE CONFIRMING FROM THE BARS: the face, cheek, flanks, and lower belly must be relatively "
            "CLEAN — free of dense small round freckling — for this ID to be correct. The FACE/CHEEK is "
            "the best place to check first, since it carries no bars to confuse the pattern with. If the "
            "face is hidden or angled away in the photo, fall back to checking the flanks and belly for "
            "freckling instead — the absence of dots there is equally diagnostic, just weigh it slightly "
            "less confidently than a clear facial view since bar shadows can be mistaken for faint dots. "
            "IMPORTANT: vertical bars ALONE are NOT enough to call a fish a Barred Sand Bass, because "
            "Spotted Bay Bass commonly show very similar bars too. DECISION RULE: only classify as Barred "
            "Sand Bass if the fish is clean of dense polka-dot freckling everywhere you can see — face, "
            "cheek, flank, and belly. If dense small round dark spots are visible ANYWHERE on the fish, "
            "it is a Spotted Bay Bass instead, regardless of how bold the bars look. COMMONLY CONFUSED "
            "WITH: Spotted Bay Bass — freckling (or its absence) anywhere on the body is the tiebreaker, "
            "not the bars."
        ),
    },
    {
        "common_name": "California Halibut",
        "scientific_name": "Paralichthys californicus",
        "habitat_description": "Sandy bottoms near bays, jetties, and surf zones",
        "typical_size_range": "12-30 in",
        "season_notes": "Year-round, best spring through fall",
        "min_size": "22 inches",
        "bag_limit": "5",
        "regulation_notes": "San Diego is South of Point Sur, so the 5 fish limit applies.",
        "classifier_description": (
            "Flatfish silhouette with both eyes on one side. Mottled brown/sand-colored on top, white "
            "on the bottom. CRITICAL FEATURES: The lateral line (the line running down the middle of "
            "the side) forms a high, distinct arch directly above the pectoral fin. The mouth is "
            "massive, with the maxilla (jaw bone) extending well past the back edge of the eye."
        ),
    },
    {
        "common_name": "Pacific Mackerel",
        "scientific_name": "Scomber japonicus",
        "habitat_description": "Open water near piers, jetties, and bait schools",
        "typical_size_range": "10-16 in",
        "season_notes": "Year-round, often thick in summer/fall",
        "min_size": "None",
        "bag_limit": "No Limit",
        "regulation_notes": "Specifically exempt from the general finfish limit.",
        "classifier_description": (
            "Rigid, torpedo-shaped body. CRITICAL FEATURES: The upper back is metallic green-blue and "
            "heavily covered in dark, wavy, vertical 'tiger' or 'zebra' squiggles. The belly is clean "
            "silver. The tail is deeply forked, with tiny finlets trailing behind the main top and "
            "bottom fins."
        ),
    },
    {
        "common_name": "Sargo",
        "scientific_name": "Anisotremus davidsonii",
        "habitat_description": "Rocky structure, jetties, and bay pilings",
        "typical_size_range": "8-14 in",
        "season_notes": "Year-round, more active in warmer months",
        "min_size": "None",
        "bag_limit": "10",
        "regulation_notes": "General finfish rules apply (max 10 per species, 20 total finfish in possession).",
        "classifier_description": (
            "Deep, compressed, oval panfish shape with a steep sloping forehead. Body color is a clean, "
            "uniform silver-grey. CRITICAL FEATURE: Identifiable by a single, prominent, thick black "
            "vertical band that wraps entirely around the middle of the body, looking like a saddle "
            "stripe."
        ),
    },
    {
        "common_name": "Corvina",
        "scientific_name": "Cynoscion xanthulus",
        "habitat_description": "Shallow bay flats and channels, often near current",
        "typical_size_range": "12-24 in",
        "season_notes": "Warmer months",
        "min_size": "None",
        "bag_limit": "10",
        "regulation_notes": "General finfish rules apply.",
        "classifier_description": (
            "Elongated, silver-grey body. CRITICAL FEATURES: Look closely at the top jaw — it contains "
            "one or two prominent, vampire-like canine teeth protruding downward. The tail fin is "
            "distinctly square, flat, or slightly indented at the edge, NEVER deeply forked. The inside "
            "of the mouth is bright yellow-orange. COMMONLY CONFUSED WITH: White Seabass or croakers. "
            "DIFFERENTIATION: The large upper canine fangs and the square tail are the giveaways."
        ),
    },
    {
        "common_name": "Surf Perch",
        "scientific_name": "Hyperprosopon argenteum",
        "habitat_description": "Sandy surf zones along open beaches",
        "typical_size_range": "6-12 in",
        "season_notes": "Year-round",
        "min_size": "None",
        "bag_limit": "20",
        "regulation_notes": (
            "20 total, max 10 per species. (Northern CA exceptions do not apply to SD). "
            "Shiner perch have a separate 20-fish limit."
        ),
        "classifier_description": (
            "Highly compressed, tall oval disk-shaped body. CRITICAL FEATURES: Flanks are bright "
            "silver, marked by a series of distinct vertical brassy, gold, or rust-colored bars (not "
            "black/dark grey bars) running along the side. COMMONLY CONFUSED WITH: Yellowfin Croaker. "
            "DIFFERENTIATION: Surf Perch has vertical bars and no chin whisker; Yellowfin Croaker has "
            "diagonal wavy lines instead of vertical bars, yellow lower fins, and a single fleshy "
            "barbel (whisker) under the chin that Surf Perch lacks."
        ),
    },
    {
        "common_name": "Gray Smoothound Shark",
        "scientific_name": "Mustelus californicus",
        "habitat_description": "Bay flats, channels, and nearshore sandy bottoms",
        "typical_size_range": "20-40 in",
        "season_notes": "Year-round, common in bays",
        "min_size": "None",
        "bag_limit": "10",
        "regulation_notes": "General finfish rules apply.",
        "classifier_description": (
            "Classic slender shark silhouette. CRITICAL FEATURES: Uniform slate-grey or brownish back "
            "fading to a white underbelly. It completely lacks any spots, bars, stripes, or scales. Has "
            "a distinct heterocercal (uneven, notched) shark tail."
        ),
    },
    {
        "common_name": "Specklefin Midshipman",
        "scientific_name": "Porichthys myriaster",
        "habitat_description": "Muddy/sandy bay bottoms, often under structure",
        "typical_size_range": "6-12 in",
        "season_notes": "Year-round, more visible at night",
        "min_size": "None",
        "bag_limit": "10",
        "regulation_notes": "General finfish rules apply.",
        "classifier_description": (
            "Heavy, thick body. Head is massive, wide, and flattened vertically (like a toad or "
            "catfish) with eyes sitting directly on top looking upward. Skin is completely smooth, "
            "scaleless, and slimy. CRITICAL FEATURES: It has extremely long, continuous, fringe-like "
            "fins running along almost the entire length of BOTH the top and bottom edges of its body. "
            "It also has huge, rounded, fan-like pectoral (side) fins. The long ribbon fins are heavily "
            "marked with distinct dark spots or speckles. POSE WARNING: If held vertically by the jaw, "
            "gravity will stretch its soft body, making the head look artificially elongated — ignore "
            "head shape and rely on body thickness, the long continuous ribbon fins, and scaleless "
            "skin. COMMONLY CONFUSED WITH: Lizardfish and Sculpin. DIFFERENTIATION FROM LIZARDFISH: "
            "Specklefin Midshipman is heavily built, has extremely long continuous top/bottom fins "
            "covered in speckles, huge fan-like side fins, a wide flat head, and smooth scaleless skin. "
            "Lizardfish is small/narrow, has a short triangular top fin, small side fins, visible "
            "scales, and a pointed snout. DIFFERENTIATION FROM SCULPIN: both species have large, round, "
            "fan-shaped pectoral (side) fins, so don't rely on pectoral fin shape alone to separate "
            "them. Instead check skin and head: Specklefin Midshipman has completely smooth, scaleless, "
            "slimy skin, a flat toad-like head with no bony ridges or spines, and long continuous "
            "ribbon-like fins running almost the full length of the top and bottom of the body. Sculpin "
            "has rough, spiny, armored skin, a blocky head covered in bony ridges and fleshy skin tabs, "
            "and a short, thick, separate dorsal fin with heavy venomous spines — NOT a long continuous "
            "ribbon fin. A smooth flat-headed fish with long ribbon fins is Specklefin Midshipman; a "
            "rough spiny-headed fish with a short spiky dorsal fin is Sculpin."
        ),
    },
    {
        "common_name": "Yellowfin Croaker",
        "scientific_name": "Umbrina roncador",
        "habitat_description": "Sandy surf zones and bay flats",
        "typical_size_range": "8-16 in",
        "season_notes": "Warmer months",
        "min_size": "None",
        "bag_limit": "10",
        "regulation_notes": "General finfish rules apply. Strictly illegal to buy or sell this species commercially.",
        "classifier_description": (
            "Small, silvery croaker with a slightly arched back. CRITICAL FEATURES: Back and sides "
            "feature highly distinct dark, diagonal wavy lines. The lower fins (pectoral, pelvic, anal) "
            "are distinctly yellow. Has a single, short, fleshy barbel (whisker) under the chin. "
            "DIFFERENTIATION: Yellowfin Croaker has a chin whisker, yellow lower fins, and diagonal "
            "lines; Surf Perch have vertical bars, no diagonal lines, and no chin whisker."
        ),
    },
    {
        "common_name": "Lizardfish",
        "scientific_name": "Synodus lucioceps",
        "habitat_description": "Sandy bay and nearshore bottoms",
        "typical_size_range": "8-16 in",
        "season_notes": "Year-round",
        "min_size": "None",
        "bag_limit": "10",
        "regulation_notes": "General finfish rules apply.",
        "classifier_description": (
            "Small, highly slender, cigar-shaped cylindrical body, covered in rigid, diamond-pattern "
            "scales. CRITICAL FEATURES: The head is pointed and reptilian with eyes on the sides. It "
            "has a single, short, triangular dorsal (top) fin resting in the middle of its back, with "
            "bare back behind it. The huge mouth cuts deeply past the eye. POSE WARNING: Even if held "
            "vertically by the jaw, the rigid scales, extreme slenderness, and short triangular top fin "
            "remain obvious. COMMONLY CONFUSED WITH: Specklefin Midshipman. DIFFERENTIATION: Lizardfish "
            "is small/narrow, has a short triangular top fin, highly visible scales, small side fins, "
            "and a pointed snout. Specklefin Midshipman is larger/chunkier, has massive continuous "
            "ribbon fins, huge fan-like side fins, a wide flat toad head, and smooth scaleless skin."
        ),
    },
    {
        "common_name": "Sculpin",
        "scientific_name": "Scorpaena guttata",
        "habitat_description": "Rocky reefs and structure, often near jetties",
        "typical_size_range": "8-15 in",
        "season_notes": "Year-round",
        "min_size": "None",
        "bag_limit": "5",
        "regulation_notes": "Size limit was officially eliminated.",
        "classifier_description": (
            "Chunky, heavy-bodied fish with ROUGH, textured skin. HARD GATE — HEAD ARMOR IS REQUIRED, "
            "CHECK THIS FIRST: a fish can only be classified as Sculpin if the head is large, blocky, "
            "and heavily armored — covered in sharp bony ridges and small fleshy skin tabs/flaps (like "
            "tiny flaps of skin sticking out, especially around the eyes and mouth). If the head is "
            "smooth and unarmored, this is NOT a Sculpin, no matter how blotchy, checkered, spotted, or "
            "irregular the body pattern looks, and no matter how spiky the dorsal fin appears or how "
            "reddish/brownish the fish is. SECOND STRONG CUE — PECTORAL FIN SHAPE: Sculpin's pectoral "
            "(front/side) fins are distinctively large, rounded, and fan-shaped, with a pleated or "
            "ribbed look to the individual fin rays, like an open hand fan — noticeably different from "
            "the smaller, more angular, pointed pectoral fins on Paralabrax bass (Spotted Bay Bass, "
            "Barred Sand Bass, Calico Bass). A big, round, pleated fan-like pectoral fin strongly "
            "supports Sculpin; a smaller, pointed pectoral fin argues against it. THIRD CUE, "
            "CONFIRMATORY ONLY — BODY PATTERN: the body pattern is typically a mottled, blotchy red, "
            "orange, and brown camouflage wash — uneven patches, NOT small uniform round dots and NOT a "
            "regular checkerboard. CRITICAL SUB-RULE — NO TRUE WHITE: Sculpin's blotches stay entirely "
            "within a warm red/orange/brown range, in darker and lighter shades of those tones — it does "
            "NOT have genuinely white or pale-white patches. If the fish shows true white blotches "
            "contrasting against darker blotches (even if the checkerboard shape itself looks irregular "
            "or poorly defined, as on a smaller fish), that is Calico Bass, not Sculpin — rule out "
            "Sculpin immediately in that case. Use body pattern only to CONFIRM a call already supported "
            "by head armor — do not use blotchy or irregular-looking pattern by itself to call Sculpin, "
            "since Calico Bass's square checkerboard blotches can also look 'irregular' at a glance "
            "despite belonging to a completely different, smooth-headed species. IMPORTANT — DO NOT use a "
            "raised/spiky dorsal fin alone as Sculpin evidence: Sculpin's dorsal spines are genuinely "
            "thick and heavy, but Paralabrax bass all also have a spiky erect anterior dorsal fin when "
            "handled — a spiky-looking fin on its own does NOT mean Sculpin. Likewise, DO NOT weight "
            "overall body color/tone (red/orange/brown vs. grey/olive) as decisive on its own — a "
            "brownish or tan bass is still a bass; color varies with habitat and lighting. DECISION "
            "RULE: only classify as Sculpin if the HEAD shows bony ridges or fleshy tabs (required) — "
            "optionally strengthened by a large, round, pleated fan-like pectoral fin and/or a blotchy, "
            "non-uniform, NON-WHITE body pattern. Never call Sculpin based on body pattern, dorsal fin "
            "or color alone if the head is smooth. NOTE ON SPECKLEFIN MIDSHIPMAN OVERLAP: Specklefin "
            "Midshipman also has large, round, fan-shaped pectoral fins, so pectoral fin shape alone "
            "does NOT separate Sculpin from Specklefin Midshipman — use skin texture and dorsal fin type "
            "instead. Sculpin has rough, spiny, scaled skin and a short, thick dorsal fin with heavy "
            "individual spines. Specklefin Midshipman has completely smooth, scaleless, slimy skin and "
            "a long continuous ribbon-like fin running almost the full length of the top and bottom of "
            "the body — nothing like Sculpin's short spiky dorsal fin. COMMONLY CONFUSED WITH: Spotted "
            "Bay Bass, Calico Bass, and Specklefin Midshipman. DIFFERENTIATION: Sculpin has a big rough "
            "armored HEAD with bony ridges and fleshy tabs, large round pleated pectoral fins, rough "
            "spiny/scaled skin, a short thick spiny dorsal fin, a chunky asymmetric build, and blotchy "
            "camouflage coloring. Spotted Bay Bass and Calico Bass both have smooth, unarmored heads, "
            "smaller pointed pectoral fins, no head spines or skin tabs — even though both can also show "
            "a spiky dorsal fin, irregular-looking body markings, and brownish coloring. Specklefin "
            "Midshipman shares Sculpin's round fan-shaped pectoral fins but has smooth scaleless skin, a "
            "flat toad-like head with no bony armor, and a long continuous ribbon dorsal fin instead of "
            "a short spiky one. Judge Sculpin by head armor and skin/dorsal-fin texture first; treat "
            "pectoral fin shape, body pattern, dorsal spikiness, and color as unreliable on their own."
        ),
    },
    {
        "common_name": "California Two-Spot Octopus",
        "scientific_name": "Octopus bimaculoides",
        "habitat_description": "Rocky tide pools, jetties, and bay structure",
        "typical_size_range": "Arm span up to 24 in",
        "season_notes": "Year-round",
        "min_size": "None",
        "bag_limit": "35",
        "regulation_notes": "Must be taken only by hand or hook-and-line. (Northern CA SCUBA restrictions do not apply to SD).",
        "classifier_description": (
            "Cephalopod. Eight highly flexible arms lined with circular suction cups. Has a bulbous "
            "head mantle and lacks any rigid fish anatomy (no fins, scales, or gills). Often features "
            "two prominent dark blue-ringed false eye-spots on the sides of the head."
        ),
    },
    {
        "common_name": "Barracuda",
        "scientific_name": "Sphyraena argentea",
        "habitat_description": "Open coastal waters, kelp edges, and piers",
        "typical_size_range": "18-36 in",
        "season_notes": "Summer through fall",
        "min_size": "28 inches",
        "bag_limit": "10",
        "regulation_notes": (
            "28 inches total length (or 17 inches alternate length). Undersized fish are not "
            "legally permitted to be kept."
        ),
        "classifier_description": (
            "Long, cylindrical body with highly visible silver scales. CRITICAL FEATURES: The lower "
            "jaw features a severe underbite, protruding significantly further than the upper jaw. It "
            "has TWO widely separated dorsal (top) fins. The tail is deeply forked and yellowish. "
            "COMMONLY CONFUSED WITH: Needlefish. DIFFERENTIATION: Barracuda have an underbite, large "
            "visible scales, and two top fins. Needlefish have symmetrical jaws (no underbite), glassy "
            "skin, and only one top fin pushed far back."
        ),
    },
    {
        "common_name": "Needlefish",
        "scientific_name": "Strongylura exilis",
        "habitat_description": "Surface waters near bays, piers, and harbors",
        "typical_size_range": "12-24 in",
        "season_notes": "Warmer months",
        "min_size": "None",
        "bag_limit": "10",
        "regulation_notes": "General finfish rules apply.",
        "classifier_description": (
            "Hyper-elongated, slender, almost snake-like body. Skin looks completely smooth and glassy "
            "green/silver. CRITICAL FEATURES: Both the upper and lower jaws are exactly equal in "
            "length, forming a long, symmetrical tweezer-like beak. It has a single dorsal (top) fin "
            "set incredibly far back, almost touching the tail. COMMONLY CONFUSED WITH: Barracuda. "
            "DIFFERENTIATION: Needlefish have symmetrical jaws (no underbite), glassy smooth skin, and "
            "only one dorsal fin pushed far back near the tail. Barracuda have a pronounced underbite "
            "(lower jaw protrudes past the upper), large visible scales, and TWO separate dorsal fins."
        ),
    },
    {
        "common_name": "Garibaldi",
        "scientific_name": "Hypsypops rubicundus",
        "habitat_description": "Rocky reefs and kelp beds (protected species — catch and release only in CA)",
        "typical_size_range": "10-14 in",
        "season_notes": "Year-round",
        "min_size": "N/A",
        "bag_limit": "0",
        "regulation_notes": "Fully Protected Species. Take or possession is strictly prohibited.",
        "classifier_description": (
            "Unmistakable. Deep, highly compressed, oval body with a very steep, rounded forehead. The "
            "coloring is a solid, uniform, brilliant neon golden-orange across the entire head, body, "
            "and deeply forked tail."
        ),
    },
]


def seed():
    if not SPECIES:
        print("SPECIES list is empty — add entries to app/seed/seed_species.py before running.")
        return

    db = SessionLocal()
    try:
        added = 0
        updated = 0
        for entry in SPECIES:
            existing = db.query(Species).filter(Species.common_name == entry["common_name"]).first()
            if existing:
                for field, value in entry.items():
                    setattr(existing, field, value)
                updated += 1
            else:
                db.add(Species(**entry))
                added += 1
        db.commit()
        print(f"Seeded {added} new species, updated {updated} existing.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()