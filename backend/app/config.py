from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./fishingdex.db"
    secret_key: str = "dev-secret-change-me"
    invite_code: str = "change-me"
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days
    upload_dir: str = "./uploads"
    max_upload_mb: int = 8
    google_api_key: str = ""
    # Web Push (VAPID). Generated once, offline, via py_vapid — never at
    # runtime, and never regenerated (that would invalidate every existing
    # subscription). vapid_admin_email is the VAPID "sub" claim, e.g.
    # "mailto:you@example.com".
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_admin_email: str = ""
    # Comma-separated list of allowed frontend origins for CORS, e.g.
    # "https://fishdex.vercel.app". Defaults to "*" for local dev.
    allowed_origins: str = "*"

    @property
    def allowed_origins_list(self) -> list[str]:
        if self.allowed_origins == "*":
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
