import base64

import anthropic
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Species

MODEL = "claude-sonnet-5"
NO_MATCH = "NONE"


def _build_species_blocks(species_list: list[Species]) -> list[dict]:
    blocks = [
        {
            "type": "text",
            "text": (
                "You are an expert marine biologist identifying fish species caught by anglers "
                "around San Diego, California. Review the following diagnostic rules carefully, "
                "one per species in the local fishing dex."
            ),
        }
    ]
    for sp in species_list:
        if not sp.classifier_description:
            continue
        blocks.append(
            {
                "type": "text",
                "text": f"Species Name: {sp.common_name} | Diagnostic Features: {sp.classifier_description}",
            }
        )
    # Cache the species rule set — it's identical across requests and large enough
    # to be worth caching for an hour of repeated "press button to identify" calls.
    blocks[-1]["cache_control"] = {"type": "ephemeral", "ttl": "1h"}
    return blocks


def identify_species(db: Session, image_bytes: bytes, media_type: str) -> tuple[Species | None, str]:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured on the backend")

    species_list = db.query(Species).order_by(Species.common_name).all()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    content = _build_species_blocks(species_list)
    content.extend(
        [
            {
                "type": "text",
                "text": "Based heavily on the differentiation rules above, carefully analyze the following image.",
            },
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
                },
            },
            {
                "type": "text",
                "text": (
                    "Identify the species in the photo. Your final line of output MUST be exactly "
                    f'one of the Species Names listed above, or the single word "{NO_MATCH}" if the '
                    "fish does not match any of them. Do not include punctuation or any other text "
                    "on that final line."
                ),
            },
        ]
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )

    raw_answer = ""
    for block in response.content:
        if block.type == "text":
            raw_answer = block.text.strip()

    final_line = raw_answer.splitlines()[-1].strip() if raw_answer else ""

    if final_line.upper() == NO_MATCH:
        return None, raw_answer

    for sp in species_list:
        if sp.common_name.lower() == final_line.lower():
            return sp, raw_answer

    return None, raw_answer
