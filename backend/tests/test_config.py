import pytest

from app.config import Settings


def test_cors_origins_from_comma_separated_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://admin.example.in, https://x.example.in")
    assert Settings().cors_origins == ["https://admin.example.in", "https://x.example.in"]


def test_production_refuses_unsafe_defaults():
    s = Settings(environment="production", otp_dev_mode=True, sms_provider="console")
    with pytest.raises(RuntimeError) as e:
        s.validate_for_production()
    msg = str(e.value)
    assert "OTP_DEV_MODE" in msg and "JWT_SECRET" in msg and "SMS_PROVIDER" in msg


def test_production_accepts_safe_config():
    Settings(environment="production", otp_dev_mode=False, sms_provider="msg91", jwt_secret="x" * 64).validate_for_production()


def test_hosted_database_urls_are_adapted_for_asyncpg():
    s = Settings(database_url="postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
    assert s.database_url == "postgresql+asyncpg://u:p@ep-x.aws.neon.tech/neondb?ssl=require"
    assert Settings(database_url="postgres://u:p@h:5432/d").database_url == "postgresql+asyncpg://u:p@h:5432/d"
    local = "postgresql+asyncpg://postgres@127.0.0.1:5433/annadaan"
    assert Settings(database_url=local).database_url == local
