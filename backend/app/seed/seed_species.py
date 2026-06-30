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
        "classifier_description": (
            "Bass body shape with an elongated third top spine. CRITICAL FEATURE: The entire head, "
            "body, and fins are densely covered in thousands of small, round, dark brown or black "
            "freckles. It looks exactly like a leopard print. COMMONLY CONFUSED WITH: Calico Bass and "
            "Barred Sand Bass. DIFFERENTIATION: The dense leopard spotting everywhere distinguishes it "
            "immediately from both Calico Bass (square blotches) and Barred Sand Bass (vertical bars)."
        ),
    },
    {
        "common_name": "Calico Bass",
        "scientific_name": "Paralabrax clathratus",
        "habitat_description": "Kelp beds, rocky reefs, and structure near the coast",
        "typical_size_range": "10-20 in",
        "season_notes": "Year-round, best late spring through fall",
        "classifier_description": (
            "Thick, heavy bass body. CRITICAL FEATURES: Distinct 'checkerboard' pattern of square-ish "
            "white and olive-brown blotches covering the body. It completely lacks vertical stripes or "
            "solid bars. The third spine on the top fin is roughly the same length as the fourth and "
            "fifth spines. COMMONLY CONFUSED WITH: Barred Sand Bass and Spotted Bay Bass. "
            "DIFFERENTIATION: Calico Bass has square blotches instead of vertical bars, and its top "
            "fin is relatively flat, lacking the elongated third-spine spike found on Barred Sand Bass."
        ),
    },
    {
        "common_name": "Barred Sand Bass",
        "scientific_name": "Paralabrax nebulifer",
        "habitat_description": "Sandy bottoms near structure, bays, and nearshore flats",
        "typical_size_range": "10-22 in",
        "season_notes": "Summer spawning aggregations, year-round otherwise",
        "classifier_description": (
            "High-backed bass body with a grey to whitish background. CRITICAL FEATURES: Dominated by "
            "distinct dark, vertical 'jail bars' running down the sides. The third spine of the top fin "
            "is dramatically elongated, standing up like a tall spike compared to the rest of the fin. "
            "COMMONLY CONFUSED WITH: Calico Bass. DIFFERENTIATION: Barred Sand Bass has vertical jail "
            "bars and an elongated third dorsal spike; Calico Bass has square blotches and flat dorsal "
            "spines."
        ),
    },
    {
        "common_name": "California Halibut",
        "scientific_name": "Paralichthys californicus",
        "habitat_description": "Sandy bottoms near bays, jetties, and surf zones",
        "typical_size_range": "12-30 in",
        "season_notes": "Year-round, best spring through fall",
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
        "classifier_description": (
            "Highly compressed, tall oval disk-shaped body. CRITICAL FEATURES: Flanks are bright "
            "silver, marked by a series of distinct vertical brassy, gold, or rust-colored bars (not "
            "black/dark grey bars) running along the side."
        ),
    },
    {
        "common_name": "Gray Smoothound Shark",
        "scientific_name": "Mustelus californicus",
        "habitat_description": "Bay flats, channels, and nearshore sandy bottoms",
        "typical_size_range": "20-40 in",
        "season_notes": "Year-round, common in bays",
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
        "classifier_description": (
            "Heavy, thick body. Head is massive, wide, and flattened vertically (like a toad or "
            "catfish) with eyes sitting directly on top looking upward. Skin is completely smooth, "
            "scaleless, and slimy. CRITICAL FEATURES: It has extremely long, continuous, fringe-like "
            "fins running along almost the entire length of BOTH the top and bottom edges of its body. "
            "It also has huge, rounded, fan-like pectoral (side) fins. The long ribbon fins are heavily "
            "marked with distinct dark spots or speckles. POSE WARNING: If held vertically by the jaw, "
            "gravity will stretch its soft body, making the head look artificially elongated — ignore "
            "head shape and rely on body thickness, the long continuous ribbon fins, and scaleless "
            "skin. COMMONLY CONFUSED WITH: Lizardfish. DIFFERENTIATION: Specklefin Midshipman is "
            "heavily built, has extremely long continuous top/bottom fins covered in speckles, huge "
            "fan-like side fins, a wide flat head, and smooth scaleless skin. Lizardfish is small/"
            "narrow, has a short triangular top fin, small side fins, visible scales, and a pointed "
            "snout."
        ),
    },
    {
        "common_name": "Yellowfin Croaker",
        "scientific_name": "Umbrina roncador",
        "habitat_description": "Sandy surf zones and bay flats",
        "typical_size_range": "8-16 in",
        "season_notes": "Warmer months",
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
        "classifier_description": (
            "Chunky, heavy-bodied fish. CRITICAL FEATURES: The head is blocky and heavily armored, "
            "covered in sharp bony spines and fleshy skin tabs. The body is a mottled red, orange, and "
            "brown camouflage pattern. The top fin consists of thick, highly visible, venomous spines. "
            "DIFFERENTIATION: If it looks spiky, blocky, and red/brown mottled, it is a Sculpin."
        ),
    },
    {
        "common_name": "California Two-Spot Octopus",
        "scientific_name": "Octopus bimaculoides",
        "habitat_description": "Rocky tide pools, jetties, and bay structure",
        "typical_size_range": "Arm span up to 24 in",
        "season_notes": "Year-round",
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
        "classifier_description": (
            "Hyper-elongated, slender, almost snake-like body. Skin looks completely smooth and glassy "
            "green/silver. CRITICAL FEATURES: Both the upper and lower jaws are exactly equal in "
            "length, forming a long, symmetrical tweezer-like beak. It has a single dorsal (top) fin "
            "set incredibly far back, almost touching the tail."
        ),
    },
    {
        "common_name": "Garibaldi",
        "scientific_name": "Hypsypops rubicundus",
        "habitat_description": "Rocky reefs and kelp beds (protected species — catch and release only in CA)",
        "typical_size_range": "10-14 in",
        "season_notes": "Year-round",
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
