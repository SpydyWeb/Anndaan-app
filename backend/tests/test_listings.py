from .conftest import DELHI, in_hours, login, post_food, sql


async def test_post_requires_sign_in(client):
    r = await client.post("/listings", json={})
    assert r.status_code == 401


async def test_post_food_and_owner_sees_address(client):
    donor = await login(client, "Meera Sharma")
    item = await post_food(client, donor, servings=6, food_type="nonveg", pickup_method="guard")
    assert item["status"] == "available" and item["servings"] == 6
    assert item["is_mine"] is True and item["can_edit"] is True
    assert item["address"].startswith("Flat 204")
    assert item["donor"]["display_name"] == "Meera S."


async def test_post_validation(client):
    donor = await login(client)
    base = {
        "food_type": "veg", "servings": 4, "pickup_method": "door", "address": "Flat 1, Sector 3",
        "area": "Sector 3", "lat": DELHI[0], "lng": DELHI[1],
    }
    cases = [
        ({"good_until": in_hours(30)}, "good_until_too_late"),
        ({"good_until": in_hours(0.1)}, "good_until_too_soon"),
        ({"good_until": in_hours(2), "servings": 0}, "validation_error"),
        ({"good_until": in_hours(2), "food_type": "raw"}, "validation_error"),
        ({"good_until": in_hours(2), "lat": 51.5, "lng": -0.1}, "validation_error"),  # outside India
        ({"good_until": "2030-01-01T10:00:00"}, "timezone_required"),
        ({"good_until": in_hours(2), "cooked_at": in_hours(-20)}, "cooked_too_long_ago"),
    ]
    for over, code in cases:
        r = await client.post("/listings", json={**base, **over}, headers=donor["headers"])
        assert r.status_code == 422, (over, r.text)
        assert r.json()["error"]["code"] == code, (over, r.json())


async def test_name_required_before_posting(client):
    donor = await login(client, None)
    r = await client.post(
        "/listings",
        json={"food_type": "veg", "servings": 2, "good_until": in_hours(2), "pickup_method": "door",
              "address": "Flat 1, Sector 3", "area": "Sector 3", "lat": DELHI[0], "lng": DELHI[1]},
        headers=donor["headers"],
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "name_required"


async def test_nearby_orders_by_distance_filters_and_hides_private_data(client):
    donor = await login(client, "Arjun Kumar")
    near = await post_food(client, donor, lat=28.7050, lng=77.1030)  # ~100 m
    mid = await post_food(client, donor, lat=28.7150, lng=77.1025, food_type="nonveg")  # ~1.2 km
    await post_food(client, donor, lat=28.80, lng=77.30)  # ~22 km: outside 5 km

    r = await client.get("/listings/nearby", params={"lat": DELHI[0], "lng": DELHI[1]})
    assert r.status_code == 200
    data = r.json()
    assert [i["id"] for i in data["items"]] == [near["id"], mid["id"]]
    assert data["total"] == 2 and data["available_count"] == 2
    assert 0 < data["items"][0]["distance_km"] < data["items"][1]["distance_km"] < 2
    for item in data["items"]:
        assert "address" not in item and "lat" not in item and "location" not in item

    veg = (await client.get("/listings/nearby", params={"lat": DELHI[0], "lng": DELHI[1], "food_type": "veg"})).json()
    assert [i["id"] for i in veg["items"]] == [near["id"]]

    wide = (await client.get("/listings/nearby", params={"lat": DELHI[0], "lng": DELHI[1], "radius_km": 25})).json()
    assert wide["total"] == 3


async def test_public_detail_hides_address_and_phone(client):
    donor = await login(client, "Meera Sharma")
    item = await post_food(client, donor)
    r = await client.get(f"/listings/{item['id']}", params={"lat": DELHI[0], "lng": DELHI[1]})
    d = r.json()
    assert r.status_code == 200 and d["address"] is None and d["donor_phone"] is None
    assert d["distance_km"] == 0.0
    stranger = await login(client, "Someone Else")
    d = (await client.get(f"/listings/{item['id']}", headers=stranger["headers"])).json()
    assert d["address"] is None and d["is_mine"] is False


async def test_expired_food_disappears_even_before_the_job_runs(client):
    donor = await login(client)
    item = await post_food(client, donor)
    await sql(
        "UPDATE food_listings SET created_at = now() - interval '5 hours', good_until = now() - interval '1 minute' WHERE id=:id",
        id=item["id"],
    )
    data = (await client.get("/listings/nearby", params={"lat": DELHI[0], "lng": DELHI[1]})).json()
    assert data["total"] == 0
    d = (await client.get(f"/listings/{item['id']}")).json()
    assert d["status"] == "expired"


async def test_edit_only_by_owner_and_only_when_available(client):
    donor = await login(client)
    other = await login(client)
    item = await post_food(client, donor)
    r = await client.patch(f"/listings/{item['id']}", json={"servings": 8}, headers=other["headers"])
    assert r.status_code == 403
    r = await client.patch(f"/listings/{item['id']}", json={"servings": 8, "good_until": in_hours(2)}, headers=donor["headers"])
    assert r.status_code == 200 and r.json()["servings"] == 8

    await client.post(f"/listings/{item['id']}/reservations", json={"for_whom": "me"}, headers=other["headers"])
    r = await client.patch(f"/listings/{item['id']}", json={"servings": 2}, headers=donor["headers"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "listing_not_editable"


async def test_cancel_listing_removes_it(client):
    donor = await login(client)
    item = await post_food(client, donor)
    other = await login(client)
    assert (await client.post(f"/listings/{item['id']}/cancel", headers=other["headers"])).status_code == 403
    r = await client.post(f"/listings/{item['id']}/cancel", headers=donor["headers"])
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert (await client.get("/listings/nearby", params={"lat": DELHI[0], "lng": DELHI[1]})).json()["total"] == 0
    r = await client.post(f"/listings/{item['id']}/cancel", headers=donor["headers"])
    assert r.status_code == 409


async def test_photo_upload_validates_content_and_strips_metadata(client):
    import io

    from PIL import Image

    donor = await login(client)
    item = await post_food(client, donor)
    fake = await client.post(
        f"/listings/{item['id']}/images",
        files={"file": ("food.jpg", b"<?php echo 'hi'; ?>", "image/jpeg")},
        headers=donor["headers"],
    )
    assert fake.status_code == 415

    buf = io.BytesIO()
    img = Image.new("RGB", (3000, 2000), (200, 150, 20))
    exif = Image.Exif()
    exif[0x8825] = {2: (28.0, 42.0, 0.0)}  # GPSInfo
    img.save(buf, "JPEG", exif=exif)
    r = await client.post(
        f"/listings/{item['id']}/images", files={"file": ("x.jpg", buf.getvalue(), "image/jpeg")}, headers=donor["headers"]
    )
    assert r.status_code == 201, r.text
    meta = r.json()
    assert max(meta["width"], meta["height"]) == 1600
    served = await client.get(meta["url"].removeprefix("/api/v1"))
    assert served.status_code == 200
    assert not Image.open(io.BytesIO(served.content)).getexif().get(0x8825)
