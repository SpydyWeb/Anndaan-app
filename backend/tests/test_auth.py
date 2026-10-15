from .conftest import login, new_phone, sql


async def test_register_with_otp_creates_user(client):
    phone = new_phone()
    r = await client.post("/auth/otp/request", json={"phone": phone[3:]})  # bare 10 digits accepted
    assert r.status_code == 200
    body = r.json()
    assert body["phone"] == phone and len(body["dev_code"]) == 6

    r = await client.post("/auth/otp/verify", json={"phone": phone, "code": body["dev_code"], "name": "Meera Sharma"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_new_user"] is True
    assert data["user"]["name"] == "Meera Sharma" and data["user"]["role"] == "member"

    me = await client.get("/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200 and me.json()["phone"] == phone


async def test_second_login_is_not_new_and_keeps_name(client):
    phone = new_phone()
    await login(client, "Ravi", phone)
    await sql("UPDATE otp_challenges SET created_at = now() - interval '5 minutes'")
    again = await login(client, None, phone)
    assert again["is_new_user"] is False and again["user"]["name"] == "Ravi"


async def test_invalid_phone_rejected(client):
    r = await client.post("/auth/otp/request", json={"phone": "12345"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_wrong_code_counts_attempts_then_locks(client):
    phone = new_phone()
    await client.post("/auth/otp/request", json={"phone": phone})
    for i in range(5):
        r = await client.post("/auth/otp/verify", json={"phone": phone, "code": "000000"})
        # the dev code could theoretically be 000000; that is a 1-in-a-million flake we accept
        assert r.status_code == 400 and r.json()["error"]["code"] == "otp_wrong"
        assert r.json()["error"]["details"]["attempts_left"] == 4 - i
    r = await client.post("/auth/otp/verify", json={"phone": phone, "code": "000000"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "otp_too_many_attempts"


async def test_resend_is_throttled(client):
    phone = new_phone()
    assert (await client.post("/auth/otp/request", json={"phone": phone})).status_code == 200
    r = await client.post("/auth/otp/request", json={"phone": phone})
    assert r.status_code == 429 and r.json()["error"]["code"] == "otp_resend_wait"


async def test_hourly_limit_per_phone(client):
    phone = new_phone()
    for _ in range(5):
        assert (await client.post("/auth/otp/request", json={"phone": phone})).status_code == 200
        await sql("UPDATE otp_challenges SET created_at = created_at - interval '1 minute'")
    r = await client.post("/auth/otp/request", json={"phone": phone})
    assert r.status_code == 429 and r.json()["error"]["code"] == "otp_limit"


async def test_expired_code_rejected(client):
    phone = new_phone()
    code = (await client.post("/auth/otp/request", json={"phone": phone})).json()["dev_code"]
    await sql("UPDATE otp_challenges SET expires_at = now() - interval '1 second'")
    r = await client.post("/auth/otp/verify", json={"phone": phone, "code": code})
    assert r.status_code == 400 and r.json()["error"]["code"] == "otp_expired"


async def test_code_cannot_be_reused(client):
    phone = new_phone()
    code = (await client.post("/auth/otp/request", json={"phone": phone})).json()["dev_code"]
    assert (await client.post("/auth/otp/verify", json={"phone": phone, "code": code})).status_code == 200
    r = await client.post("/auth/otp/verify", json={"phone": phone, "code": code})
    assert r.status_code == 400


async def test_refresh_rotates_and_detects_reuse(client):
    s = await login(client)
    r1 = await client.post("/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r1.status_code == 200
    new = r1.json()
    assert new["refresh_token"] != s["refresh_token"]

    # Re-using the old token is treated as theft: the whole family is revoked.
    r2 = await client.post("/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r2.status_code == 401
    r3 = await client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert r3.status_code == 401


async def test_logout_revokes_refresh(client):
    s = await login(client)
    assert (await client.post("/auth/logout", json={"refresh_token": s["refresh_token"]})).status_code == 204
    r = await client.post("/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 401


async def test_protected_routes_need_valid_token(client):
    assert (await client.get("/me")).status_code == 401
    r = await client.get("/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_token"


async def test_suspended_user_is_blocked(client):
    s = await login(client)
    await sql("UPDATE users SET status='suspended' WHERE id=:id", id=s["user"]["id"])
    r = await client.get("/me", headers=s["headers"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_suspended"
    r = await client.post("/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 403


async def test_update_profile(client):
    s = await login(client, None)
    r = await client.patch("/me", json={"name": "  Sunita   Devi ", "area": "Sector 7", "language": "hi"}, headers=s["headers"])
    assert r.status_code == 200
    assert r.json()["name"] == "Sunita Devi" and r.json()["language"] == "hi"
    r = await client.patch("/me", json={"language": "fr"}, headers=s["headers"])
    assert r.status_code == 422
