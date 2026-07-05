from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Species

DEFAULT_MODEL = "gemini-3.1-flash-lite"
ALLOWED_MODELS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview"]
MODEL_SETTING_KEY = "identify_model"
NO_MATCH = "NONE"


def get_active_model(db: Session) -> str:
    setting = db.get(AppSetting, MODEL_SETTING_KEY)
    if setting and setting.value in ALLOWED_MODELS:
        return setting.value
    return DEFAULT_MODEL


def _build_prompt_text(species_list: list[Species]) -> str:
    lines = [
        "You are an expert marine biologist identifying fish species caught by anglers "
        "around San Diego, California. Review the following diagnostic rules carefully, "
        "one per species in the local fishing dex."
    ]
    for sp in species_list:
        if not sp.classifier_description:
            continue
        lines.append(f"Species Name: {sp.common_name} | Diagnostic Features: {sp.classifier_description}")
    lines.append("Based heavily on the differentiation rules above, carefully analyze the following image.")
    lines.append(
        "Identify the species in the photo. Your final line of output MUST be exactly "
        f'one of the Species Names listed above, or the single word "{NO_MATCH}" if the '
        "fish does not match any of them. Do not include punctuation or any other text "
        "on that final line."
    )
    return "\n\n".join(lines)


def identify_species(db: Session, image_bytes: bytes, media_type: str) -> tuple[Species | None, str]:
    if not settings.google_api_key:
        raise RuntimeError("GOOGLE_API_KEY is not configured on the backend")

    species_list = db.query(Species).order_by(Species.common_name).all()
    client = genai.Client(api_key=settings.google_api_key)

    prompt_text = _build_prompt_text(species_list)
    response = client.models.generate_content(
        model=get_active_model(db),
        contents=[prompt_text, types.Part.from_bytes(data=image_bytes, mime_type=media_type)],
    )

    raw_answer = (response.text or "").strip()
    final_line = raw_answer.splitlines()[-1].strip() if raw_answer else ""

    if final_line.upper() == NO_MATCH:
        return None, raw_answer

    for sp in species_list:
        if sp.common_name.lower() == final_line.lower():
            return sp, raw_answer

    return None, raw_answer
