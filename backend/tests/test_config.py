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
