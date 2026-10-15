import asyncio
import uuid

from app.db import SessionLocal
from app.services.food import run_expiry

from .conftest import DELHI, login, post_food, sql


async def reserve(client, user, listing_id, **over):
    body = {"for_whom": "needy", "eta_minutes": 30}
    body.update(over)
    return await client.post(f"/listings/{listing_id}/reservations", json=body, headers=user["headers"])


async def test_reserve_door_pickup_gives_code_only_to_collector(client):
    donor = await login(client, "Meera Sharma")
    ravi = await login(client, "Ravi Kumar")
    item = await post_food(client, donor)

    r = await reserve(client, ravi, item["id"])
    assert r.status_code == 201, r.text
    res = r.json()
    assert res["status"] == "active" and res["role"] == "collector"
    assert len(res["pickup_code"]) == 4 and res["pickup_code"].isdigit()
    assert res["address"].startswith("Flat 204")
    assert res["donor"]["phone"] == donor["phone"] and res["collector"] is None

    as_donor = (await client.get(f"/reservations/{res['id']}", headers=donor["headers"])).json()
    assert as_donor["pickup_code"] is None
    assert as_donor["collector"]["name"] == "Ravi Kumar" and as_donor["for_whom"] == "needy"

    # Now the meal shows as reserved to everyone and its address is visible to the collector.
    listed = (await client.get("/listings/nearby", params={"lat": DELHI[0], "lng": DELHI[1]})).json()
    assert listed["items"][0]["status"] == "reserved" and listed["available_count"] == 0
    detail = (await client.get(f"/listings/{item['id']}", headers=ravi["headers"])).json()
    assert detail["address"] and detail["my_reservation_id"] == res["id"]

    # Strangers cannot see someone else's reservation at all.
    stranger = await login(client)
    assert (await client.get(f"/reservations/{res['id']}", headers=stranger["headers"])).status_code == 404

    # The donor was notified.
    notes = (await client.get("/notifications", headers=donor["headers"])).json()
    assert notes["items"][0]["kind"] == "reservation_created"
    assert "Ravi" in notes["items"][0]["body_en"] and "रवि" not in notes["items"][0]["body_en"]


async def test_concurrent_reservations_exactly_one_wins(client):
    donor = await login(client)
    item = await post_food(client, donor)
    collectors = [await login(client, f"Collector {i}") for i in range(12)]

    results = await asyncio.gather(*(reserve(client, c, item["id"]) for c in collectors))
    codes = sorted(r.status_code for r in results)
    assert codes.count(201) == 1, codes
    assert all(r.json()["error"]["code"] == "listing_reserved" for r in results if r.status_code == 409)
    assert codes.count(409) == 11

    rows = (await sql("SELECT count(*) FROM reservations WHERE listing_id=:id", id=item["id"])).scalar()
    assert rows == 1


async def test_idempotent_retry_returns_same_reservation(client):
    donor = await login(client)
    ravi = await login(client)
    item = await post_food(client, donor)
    key = uuid.uuid4().hex
    results = await asyncio.gather(*(reserve(client, ravi, item["id"], idempotency_key=key) for _ in range(4)))
    ids = {r.json()["id"] for r in results}
    assert len(ids) == 1
    assert sorted(r.status_code for r in results) == [200, 200, 200, 201]


async def test_reservation_rules(client):
    donor = await login(client)
    ravi = await login(client)
    item = await post_food(client, donor)

    r = await reserve(client, donor, item["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "own_listing"

    r = await reserve(client, ravi, item["id"], eta_minutes=600)
    assert r.status_code == 422 and r.json()["error"]["code"] == "eta_after_good_until"

    r = await reserve(client, ravi, str(uuid.uuid4()))
    assert r.status_code == 404

    r = await reserve(client, ravi, item["id"], for_whom="everyone")
    assert r.status_code == 422

    cancelled = await post_food(client, donor)
    await client.post(f"/listings/{cancelled['id']}/cancel", headers=donor["headers"])
    r = await reserve(client, ravi, cancelled["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "listing_unavailable"

    expired = await post_food(client, donor)
    await sql(
        "UPDATE food_listings SET created_at=now()-interval '5 hours', good_until=now()-interval '1 minute' WHERE id=:id",
        id=expired["id"],
    )
    r = await reserve(client, ravi, expired["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "listing_expired"


async def test_collector_limited_to_two_active_reservations(client):
    donor = await login(client)
    ravi = await login(client)
    items = [await post_food(client, donor) for _ in range(3)]
    assert (await reserve(client, ravi, items[0]["id"])).status_code == 201
    assert (await reserve(client, ravi, items[1]["id"])).status_code == 201
    r = await reserve(client, ravi, items[2]["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "too_many_reservations"


async def test_collector_cancel_puts_meal_back(client):
    donor = await login(client)
    ravi = await login(client)
    item = await post_food(client, donor)
    res = (await reserve(client, ravi, item["id"])).json()

    assert (await client.post(f"/reservations/{res['id']}/cancel", headers=donor["headers"])).status_code == 403
    r = await client.post(f"/reservations/{res['id']}/cancel", headers=ravi["headers"])
    assert r.status_code == 200 and r.json()["status"] == "cancelled_by_collector"
    assert r.json()["pickup_code"] is None and r.json()["address"] is None
    detail = (await client.get(f"/listings/{item['id']}")).json()
    assert detail["status"] == "available"
    assert (await client.post(f"/reservations/{res['id']}/cancel", headers=ravi["headers"])).status_code == 409

    # Someone else can now reserve it.
    sunita = await login(client)
    assert (await reserve(client, sunita, item["id"])).status_code == 201


async def test_donor_reactivates_after_no_show_and_old_code_stops_working(client):
    donor = await login(client)
    ravi = await login(client)
    item = await post_food(client, donor)
    res = (await reserve(client, ravi, item["id"])).json()

    r = await client.post(f"/listings/{item['id']}/reactivate", json={}, headers=donor["headers"])
    assert r.status_code == 200 and r.json()["status"] == "available"

    old = (await client.get(f"/reservations/{res['id']}", headers=ravi["headers"])).json()
    assert old["status"] == "cancelled_by_donor" and old["pickup_code"] is None
    r = await client.post(f"/reservations/{res['id']}/verify-code", json={"code": res["pickup_code"]}, headers=donor["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "reservation_closed"

    kinds = [n["kind"] for n in (await client.get("/notifications", headers=ravi["headers"])).json()["items"]]
    assert "reservation_cancelled_by_donor" in kinds

    # Donor may shorten good-until while relisting, never extend it.
    res2 = (await reserve(client, await login(client), item["id"])).json()
    assert res2["status"] == "active"
    from .conftest import in_hours

    r = await client.post(f"/listings/{item['id']}/reactivate", json={"good_until": in_hours(10)}, headers=donor["headers"])
    assert r.status_code == 422
    r = await client.post(f"/listings/{item['id']}/reactivate", json={"good_until": in_hours(1)}, headers=donor["headers"])
    assert r.status_code == 200


async def test_pickup_code_verification_and_lockout(client):
    donor = await login(client, "Meera Sharma")
    ravi = await login(client, "Ravi")
    item = await post_food(client, donor)
    res = (await reserve(client, ravi, item["id"])).json()
    code = res["pickup_code"]
    wrong = "0000" if code != "0000" else "1111"

    # Only the donor enters the code.
    r = await client.post(f"/reservations/{res['id']}/verify-code", json={"code": code}, headers=ravi["headers"])
    assert r.status_code == 403
    r = await client.post(f"/reservations/{res['id']}/verify-code", json={"code": "12"}, headers=donor["headers"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"

    r = await client.post(f"/reservations/{res['id']}/verify-code", json={"code": wrong}, headers=donor["headers"])
    assert r.status_code == 422 and r.json()["error"]["details"]["attempts_left"] == 4

    r = await client.post(f"/reservations/{res['id']}/verify-code", json={"code": code}, headers=donor["headers"])
    assert r.status_code == 200
    done = r.json()
    assert done["status"] == "completed" and done["can_review"] is True

    # Repeated confirmation is rejected; the meal is gone from the list.
    r = await client.post(f"/reservations/{res['id']}/verify-code", json={"code": code}, headers=donor["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_completed"
    assert (await client.get("/listings/nearby", params={"lat": DELHI[0], "lng": DELHI[1]})).json()["total"] == 0
    assert (await client.get(f"/listings/{item['id']}")).json()["status"] == "collected"

    stats = (await client.get("/me/stats", headers=donor["headers"])).json()
    assert stats["meals_shared"] == 1 and stats["people_fed"] == 4
    assert (await client.get("/me/stats", headers=ravi["headers"])).json()["meals_collected"] == 1

    # Lockout after five wrong codes.
    item2 = await post_food(client, donor)
    res2 = (await reserve(client, ravi, item2["id"])).json()
    bad = "0000" if res2["pickup_code"] != "0000" else "1111"
    for _ in range(5):
        await client.post(f"/reservations/{res2['id']}/verify-code", json={"code": bad}, headers=donor["headers"])
    r = await client.post(f"/reservations/{res2['id']}/verify-code", json={"code": res2["pickup_code"]}, headers=donor["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "code_locked"
    state = (await client.get(f"/reservations/{res2['id']}", headers=ravi["headers"])).json()
    assert state["code_locked"] is True and state["pickup_code"] is None


async def test_guard_handover_first_yes_from_either_side(client):
    donor = await login(client, "Hotel Pind Rasoi")
    ravi = await login(client, "Ravi")
    item = await post_food(client, donor, pickup_method="guard", servings=10)
    res = (await reserve(client, ravi, item["id"], eta_minutes=None)).json()
    assert res["pickup_code"] is None

    r = await client.post(f"/reservations/{res['id']}/verify-code", json={"code": "1234"}, headers=donor["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_code"

    r = await client.post(f"/reservations/{res['id']}/confirm-collected", headers=ravi["headers"])
    assert r.status_code == 200 and r.json()["status"] == "completed"
    assert r.json()["collector_confirmed_at"] and r.json()["donor_confirmed_at"] is None
    # The other side saying yes afterwards is harmless.
    r = await client.post(f"/reservations/{res['id']}/confirm-collected", headers=donor["headers"])
    assert r.status_code == 200 and r.json()["status"] == "completed"

    stranger = await login(client)
    r = await client.post(f"/reservations/{res['id']}/confirm-collected", headers=stranger["headers"])
    assert r.status_code == 404

    door = await post_food(client, donor)
    res2 = (await reserve(client, ravi, door["id"])).json()
    r = await client.post(f"/reservations/{res2['id']}/confirm-collected", headers=donor["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "code_required"


async def test_reviews_after_handover(client):
    donor = await login(client, "Meera Sharma")
    ravi = await login(client, "Ravi Kumar")
    item = await post_food(client, donor, pickup_method="guard")
    res = (await reserve(client, ravi, item["id"])).json()

    r = await client.post(f"/reservations/{res['id']}/review", json={"stars": 5}, headers=ravi["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_completed"

    await client.post(f"/reservations/{res['id']}/confirm-collected", headers=donor["headers"])
    body = {"stars": 5, "tags": ["fresh", "packed_well", "fresh"], "comment": "Food was fresh and still warm."}
    r = await client.post(f"/reservations/{res['id']}/review", json=body, headers=ravi["headers"])
    assert r.status_code == 201 and r.json()["author_name"] == "Ravi" and r.json()["tags"] == ["fresh", "packed_well"]
    r = await client.post(f"/reservations/{res['id']}/review", json=body, headers=ravi["headers"])
    assert r.status_code == 409
    r = await client.post(f"/reservations/{res['id']}/review", json={"stars": 6}, headers=donor["headers"])
    assert r.status_code == 422
    r = await client.post(f"/reservations/{res['id']}/review", json={"stars": 4, "tags": ["on_time"]}, headers=donor["headers"])
    assert r.status_code == 201

    prof = (await client.get(f"/users/{donor['user']['id']}/profile")).json()
    assert prof["display_name"] == "Meera S." and prof["rating"] == 5.0 and prof["review_count"] == 1
    assert prof["meals_shared"] == 1 and {"tag": "fresh", "count": 1} in prof["top_tags"]
    assert "phone" not in prof

    nxt = await post_food(client, donor)
    d = (await client.get(f"/listings/{nxt['id']}")).json()
    assert d["donor"]["rating"] == 5.0 and d["latest_review"]["comment"].startswith("Food was fresh")


async def test_expiry_job(client):
    donor = await login(client)
    ravi = await login(client)
    available = await post_food(client, donor)
    reserved = await post_food(client, donor)
    soon = await post_food(client, donor, pickup_method="guard")
    res = (await reserve(client, ravi, reserved["id"])).json()
    res_soon = (await reserve(client, ravi, soon["id"], eta_minutes=10)).json()

    await sql(
        "UPDATE food_listings SET created_at=now()-interval '6 hours', good_until=now()-interval '1 minute' WHERE id=:id",
        id=available["id"],
    )
    await sql(
        "UPDATE food_listings SET created_at=now()-interval '6 hours', good_until=now()-interval '31 minutes' WHERE id=:id",
        id=reserved["id"],
    )
    await sql("UPDATE food_listings SET good_until=now()+interval '20 minutes' WHERE id=:id", id=soon["id"])

    async with SessionLocal() as session:
        counts = await run_expiry(session)
    assert counts == {"expired_available": 1, "expired_reserved": 1, "reminders": 1}

    assert (await client.get(f"/listings/{available['id']}")).json()["status"] == "expired"
    assert (await client.get(f"/reservations/{res['id']}", headers=ravi["headers"])).json()["status"] == "expired"
    assert (await client.get(f"/reservations/{res_soon['id']}", headers=ravi["headers"])).json()["status"] == "active"
    kinds = [n["kind"] for n in (await client.get("/notifications", headers=ravi["headers"])).json()["items"]]
    assert "expiry_reminder" in kinds and "reservation_expired" in kinds

    async with SessionLocal() as session:  # idempotent
        assert await run_expiry(session) == {"expired_available": 0, "expired_reserved": 0, "reminders": 0}


async def test_my_history_endpoints(client):
    donor = await login(client)
    ravi = await login(client)
    item = await post_food(client, donor, pickup_method="guard")
    res = (await reserve(client, ravi, item["id"])).json()

    mine = (await client.get("/me/listings", params={"state": "open"}, headers=donor["headers"])).json()
    assert mine["total"] == 1 and mine["items"][0]["active_reservation"]["id"] == res["id"]
    await client.post(f"/reservations/{res['id']}/confirm-collected", headers=ravi["headers"])
    assert (await client.get("/me/listings", params={"state": "open"}, headers=donor["headers"])).json()["total"] == 0
    hist = (await client.get("/me/reservations", params={"state": "history"}, headers=ravi["headers"])).json()
    assert hist["items"][0]["status"] == "completed"

    r = await client.post("/notifications/read", json={}, headers=ravi["headers"])
    assert r.status_code == 204
    assert (await client.get("/notifications/unread-count", headers=ravi["headers"])).json()["unread"] == 0


async def test_reports(client):
    donor = await login(client)
    ravi = await login(client)
    item = await post_food(client, donor)
    r = await client.post("/reports", json={"listing_id": item["id"], "reason": "unsafe_food", "details": "Smelled off"},
                          headers=ravi["headers"])
    assert r.status_code == 201 and r.json()["status"] == "open"
    r = await client.post("/reports", json={"reason": "other"}, headers=ravi["headers"])
    assert r.status_code == 422
    r = await client.post("/reports", json={"user_id": ravi["user"]["id"], "reason": "abusive"}, headers=ravi["headers"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "report_self"


async def test_job_runner_lock_is_exclusive_and_released(client):
    import asyncio as aio

    from app.jobs import run_once

    results = await aio.gather(run_once(), run_once())
    assert sum(r is not None for r in results) >= 1
    # The lock must be free again afterwards, so the next pass runs.
    assert await run_once() is not None
