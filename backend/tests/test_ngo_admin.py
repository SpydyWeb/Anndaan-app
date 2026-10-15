import asyncio
import io
from datetime import date, timedelta

from PIL import Image

from .conftest import DELHI, login, make_admin, post_food, sql

NGO = {
    "name": "Asha Kiran Children's Home",
    "registration_id": "dl/2019/0234567",
    "contact_name": "Sunil Mehra",
    "contact_phone": "9873015123",
    "address": "Plot 12, Sector 7, Rohini, Delhi",
    "area": "Sector 7, Rohini",
    "lat": 28.7100,
    "lng": 77.1100,
}

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


async def registered_ngo(client):
    owner = await login(client, "Sunil Mehra")
    r = await client.post("/ngos", json=NGO, headers=owner["headers"])
    assert r.status_code == 201, r.text
    return owner


def need_body(**over):
    body = {
        "meal": "lunch", "people": 30, "audience": "children", "frequency": "daily",
        "start_date": (date.today() + timedelta(days=1)).isoformat(), "meal_time": "12:30:00", "food_pref": "veg",
    }
    body.update(over)
    return body


async def test_ngo_is_active_right_after_otp_registration(client):
    """No admin approval: a phone-verified owner registers and can post needs immediately."""
    owner = await login(client, "Sunil Mehra")
    r = await client.post("/ngos", json=NGO, headers=owner["headers"])
    assert r.status_code == 201
    ngo = r.json()
    assert ngo["status"] == "verified" and ngo["registration_id"] == "DL/2019/0234567" and ngo["has_certificate"] is False
    assert (await client.post("/ngos", json=NGO, headers=owner["headers"])).status_code == 409
    assert (await client.get("/me", headers=owner["headers"])).json()["ngo"]["status"] == "verified"

    # Posting a need works straight away, with no certificate.
    r = await client.post("/ngos/mine/needs", json=need_body(), headers=owner["headers"])
    assert r.status_code == 201, r.text
    assert (await client.get("/ngos/needs")).json()["total"] == 1

    # Certificate stays optional, and is still content-checked when given.
    r = await client.post("/ngos/mine/certificate", files={"file": ("c.pdf", b"MZ\x90\x00evil", "application/pdf")},
                          headers=owner["headers"])
    assert r.status_code == 415
    r = await client.post("/ngos/mine/certificate", files={"file": ("c.pdf", PDF, "application/pdf")}, headers=owner["headers"])
    assert r.status_code == 200 and r.json()["has_certificate"] is True

    # Details can be edited at any time.
    r = await client.patch("/ngos/mine", json={**NGO, "area": "Sector 8, Rohini"}, headers=owner["headers"])
    assert r.status_code == 200 and r.json()["area"] == "Sector 8, Rohini" and r.json()["status"] == "verified"


async def test_admin_can_pause_and_reenable_an_ngo(client):
    owner = await registered_ngo(client)
    need = (await client.post("/ngos/mine/needs", json=need_body(), headers=owner["headers"])).json()
    ngo_id = (await client.get("/ngos/mine", headers=owner["headers"])).json()["id"]

    # Only admins can pause.
    assert (await client.post(f"/admin/ngos/{ngo_id}/reject", json={"reason": "Fake NGO"}, headers=owner["headers"])).status_code == 403
    admin = await login(client, "Admin")
    await make_admin(admin)
    r = await client.post(f"/admin/ngos/{ngo_id}/reject", json={"reason": "Fake NGO reported by donors"}, headers=admin["headers"])
    assert r.json()["status"] == "rejected"

    # Paused: its needs disappear, it cannot post new ones, and editing does not unpause it.
    assert (await client.get("/ngos/needs")).json()["total"] == 0
    assert (await client.get(f"/ngos/needs/{need['id']}")).status_code == 404
    assert (await client.post("/ngos/mine/needs", json=need_body(), headers=owner["headers"])).status_code == 403
    assert (await client.patch("/ngos/mine", json=NGO, headers=owner["headers"])).json()["status"] == "rejected"
    kinds = [n["kind"] for n in (await client.get("/notifications", headers=owner["headers"])).json()["items"]]
    assert "ngo_rejected" in kinds

    # Re-enable (no certificate needed).
    r = await client.post(f"/admin/ngos/{ngo_id}/verify", headers=admin["headers"])
    assert r.status_code == 200 and r.json()["status"] == "verified"
    assert (await client.post("/ngos/mine/needs", json=need_body(), headers=owner["headers"])).status_code == 201


async def test_needs_and_pledges(client):
    owner = await registered_ngo(client)
    r = await client.post("/ngos/mine/needs", json=need_body(), headers=owner["headers"])
    assert r.status_code == 201, r.text
    need = r.json()
    assert need["ngo"]["verified"] is True and need["next"]["remaining"] == 30

    bad = await client.post("/ngos/mine/needs", json=need_body(start_date="2020-01-01"), headers=owner["headers"])
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "start_in_past"

    public = (await client.get("/ngos/needs", params={"lat": DELHI[0], "lng": DELHI[1]})).json()
    assert public["total"] == 1 and public["items"][0]["distance_km"] is not None

    detail = (await client.get(f"/ngos/needs/{need['id']}")).json()
    assert len(detail["upcoming"]) == 3
    day = detail["upcoming"][0]["date"]

    meera = await login(client, "Meera Sharma")
    r = await client.post(f"/ngos/needs/{need['id']}/pledges", json={"people": 10, "for_date": day, "delivery": "drop_off"},
                          headers=meera["headers"])
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["occurrence"] == {"date": day, "covered": 10, "remaining": 20}
    assert p["ngo_contact_phone"] == "+919873015123"

    r = await client.post(f"/ngos/needs/{need['id']}/pledges", json={"people": 25, "for_date": day, "delivery": "collect"},
                          headers=meera["headers"])
    assert r.status_code == 422 and r.json()["error"]["details"]["remaining"] == 20

    r = await client.post(f"/ngos/needs/{need['id']}/pledges", json={"people": 5, "for_date": "2020-01-01", "delivery": "collect"},
                          headers=meera["headers"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_date"

    r = await client.post(f"/ngos/needs/{need['id']}/pledges", json={"people": 5, "for_date": day, "delivery": "collect"},
                          headers=owner["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "own_need"

    # The NGO sees who is coming, and the owner was notified.
    got = (await client.get("/ngos/mine/pledges", headers=owner["headers"])).json()
    assert got["items"][0]["donor_name"] == "Meera Sharma"
    kinds = [n["kind"] for n in (await client.get("/notifications", headers=owner["headers"])).json()["items"]]
    assert "pledge_created" in kinds
    r = await client.post(f"/ngos/mine/pledges/{p['id']}/received", headers=owner["headers"])
    assert r.json()["status"] == "received"

    assert (await client.get(f"/pledges/{p['id']}", headers=meera["headers"])).json()["people"] == 10
    stranger = await login(client)
    assert (await client.get(f"/pledges/{p['id']}", headers=stranger["headers"])).status_code == 404

    # Donor history and cancelling.
    mine = (await client.get("/me/pledges", headers=meera["headers"])).json()
    assert mine["total"] == 1
    p2 = (await client.post(f"/ngos/needs/{need['id']}/pledges", json={"people": 5, "for_date": day, "delivery": "collect"},
                            headers=meera["headers"])).json()
    r = await client.post(f"/pledges/{p2['id']}/cancel", headers=meera["headers"])
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["occurrence"]["covered"] == 10


async def test_concurrent_pledges_never_exceed_need(client):
    owner = await registered_ngo(client)
    need = (await client.post("/ngos/mine/needs", json=need_body(people=20, frequency="once"), headers=owner["headers"])).json()
    day = need["next"]["date"]
    donors = [await login(client, f"Donor {i}") for i in range(8)]
    results = await asyncio.gather(
        *(
            client.post(f"/ngos/needs/{need['id']}/pledges", json={"people": 5, "for_date": day, "delivery": "drop_off"},
                        headers=d["headers"])
            for d in donors
        )
    )
    assert sorted(r.status_code for r in results).count(201) == 4
    total = (await sql("SELECT sum(people) FROM ngo_pledges WHERE status <> 'cancelled'")).scalar()
    assert total == 20
    detail = (await client.get(f"/ngos/needs/{need['id']}")).json()
    assert detail["next"]["remaining"] == 0


async def test_unverified_ngo_needs_are_hidden(client):
    owner = await registered_ngo(client)
    need = (await client.post("/ngos/mine/needs", json=need_body(), headers=owner["headers"])).json()
    await sql("UPDATE ngos SET status='rejected'")
    assert (await client.get("/ngos/needs")).json()["total"] == 0
    assert (await client.get(f"/ngos/needs/{need['id']}")).status_code == 404


async def test_admin_endpoints_require_admin(client):
    assert (await client.get("/admin/stats")).status_code == 401
    user = await login(client)
    for path in ("/admin/stats", "/admin/users", "/admin/listings", "/admin/reservations", "/admin/ngos", "/admin/reports", "/admin/audit"):
        r = await client.get(path, headers=user["headers"])
        assert r.status_code == 403, path


async def test_admin_moderation(client):
    admin = await login(client, "Admin")
    await make_admin(admin)
    donor = await login(client, "Bad Actor")
    ravi = await login(client, "Ravi")
    item = await post_food(client, donor)
    res = (await client.post(f"/listings/{item['id']}/reservations", json={"for_whom": "me"}, headers=ravi["headers"])).json()
    rep = (await client.post("/reports", json={"listing_id": item["id"], "reason": "unsafe_food"}, headers=ravi["headers"])).json()

    stats = (await client.get("/admin/stats", headers=admin["headers"])).json()
    assert stats["users_total"] == 3 and stats["reservations_active"] == 1 and stats["reports_open"] == 1

    reports = (await client.get("/admin/reports", headers=admin["headers"])).json()
    assert reports["items"][0]["user_name"] == "Bad Actor"

    r = await client.post(f"/admin/reports/{rep['id']}/resolve", json={"action": "suspend_user", "note": "unsafe food"},
                          headers=admin["headers"])
    assert r.status_code == 200 and r.json()["status"] == "actioned"

    # Suspended: blocked, sessions ended, open food removed, collector told.
    assert (await client.get("/me", headers=donor["headers"])).status_code == 403
    assert (await client.post("/auth/refresh", json={"refresh_token": donor["refresh_token"]})).status_code in (401, 403)
    assert (await client.get(f"/listings/{item['id']}")).status_code == 404
    got = (await client.get(f"/reservations/{res['id']}", headers=ravi["headers"])).json()
    assert got["status"] == "cancelled_by_donor"

    users = (await client.get("/admin/users", params={"status": "suspended"}, headers=admin["headers"])).json()
    assert users["total"] == 1 and users["items"][0]["reports_against"] == 0
    r = await client.post(f"/admin/users/{admin['user']['id']}/suspend", json={"reason": "test"}, headers=admin["headers"])
    assert r.status_code == 409

    r = await client.post(f"/admin/users/{donor['user']['id']}/unsuspend", headers=admin["headers"])
    assert r.json()["status"] == "active"

    audit = (await client.get("/admin/audit", headers=admin["headers"])).json()
    actions = {a["action"] for a in audit["items"]}
    assert {"admin.user_suspend", "admin.listing_remove", "admin.report_resolve", "reservation.create"} <= actions

    listings = (await client.get("/admin/listings", params={"status": "removed"}, headers=admin["headers"])).json()
    assert listings["total"] == 1 and listings["items"][0]["reports_count"] == 1
    res_list = (await client.get("/admin/reservations", headers=admin["headers"])).json()
    assert res_list["items"][0]["collector_name"] == "Ravi"


async def test_certificate_photo_is_reencoded(client):
    owner = await login(client)
    await client.post("/ngos", json={**NGO, "registration_id": "UP/2020/77"}, headers=owner["headers"])
    buf = io.BytesIO()
    Image.new("RGB", (800, 600), "white").save(buf, "PNG")
    r = await client.post("/ngos/mine/certificate", files={"file": ("c.png", buf.getvalue(), "image/png")}, headers=owner["headers"])
    assert r.status_code == 200
    got = await client.get("/ngos/mine/certificate", headers=owner["headers"])
    assert got.headers["content-type"] == "image/jpeg"
    big = b"%PDF-" + b"0" * (5 * 1024 * 1024 + 10)
    r = await client.post("/ngos/mine/certificate", files={"file": ("c.pdf", big, "application/pdf")}, headers=owner["headers"])
    assert r.status_code == 413
