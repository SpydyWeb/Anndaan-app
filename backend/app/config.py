from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = Field("development", description="development | test | production")
    database_url: str = "postgresql+asyncpg://postgres@127.0.0.1:5433/annadaan"

    # Auth
    jwt_secret: str = "dev-only-change-me-dev-only-change-me"
    jwt_issuer: str = "annadaan"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    # OTP / SMS
    otp_dev_mode: bool = True  # returns the code in the API response; never enable in production
    # Numbers that become admins when they sign in, e.g. "9911320092,9811042345". Lets you create
    # the first admin from the hosting dashboard instead of a command line.
    admin_phones: Annotated[list[str], NoDecode] = []
    otp_length: int = 6
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    otp_resend_seconds: int = 30
    otp_max_per_phone_per_hour: int = 5
    otp_max_per_ip_per_hour: int = 30
    sms_provider: str = "console"  # console | msg91
    msg91_auth_key: str = ""
    msg91_otp_template_id: str = ""
    msg91_flow_template_id: str = ""  # optional: transactional SMS (NGO verification result)

    # Pickup codes
    pickup_code_max_attempts: int = 5

    # Files
    upload_dir: str = "./data/uploads"
    max_upload_mb: int = 5

    # Push
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_access_token: str = ""  # optional, only if "enhanced push security" is on in Expo

    # Jobs
    run_jobs: bool = True
    job_interval_seconds: int = 60

    # HTTP
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173", "http://localhost:8081"]
    rate_limit_per_minute: int = 120
    trust_proxy_headers: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def _asyncpg_url(cls, v):
        """Accept the plain URLs hosts hand out (Neon, Render, Heroku-style) and adapt them:
        postgres://...?sslmode=require  ->  postgresql+asyncpg://...?ssl=require"""
        if not isinstance(v, str):
            return v
        from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

        parts = urlsplit(v)
        scheme = parts.scheme
        if scheme in ("postgres", "postgresql"):
            scheme = "postgresql+asyncpg"
        params = []
        for key, value in parse_qsl(parts.query):
            if key == "sslmode":
                params.append(("ssl", value))
            elif key == "channel_binding":  # libpq-only option asyncpg does not understand
                continue
            else:
                params.append((key, value))
        return urlunsplit((scheme, parts.netloc, parts.path, urlencode(params), parts.fragment))

    @field_validator("admin_phones", mode="before")
    @classmethod
    def _phones(cls, v):
        from .schemas import normalize_phone

        if isinstance(v, str):
            v = [p for p in v.split(",") if p.strip()]
        return [normalize_phone(p) for p in v]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def validate_for_production(self) -> None:
        if not self.is_production:
            return
        problems = []
        if self.otp_dev_mode:
            problems.append("OTP_DEV_MODE must be false")
        if len(self.jwt_secret) < 32 or "dev-only" in self.jwt_secret:
            problems.append("JWT_SECRET must be a random string of at least 32 characters")
        if self.sms_provider == "console":
            problems.append("SMS_PROVIDER must be a real provider (msg91)")
        if problems:
            raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
