# Product decisions and open questions

## Behaviour as built

**Accounts.** Browsing meals and NGO needs needs no account. A mobile number verified by SMS
code is required the first time someone posts food, reserves a meal, gives to an NGO or
registers an NGO (as the design says: "Needed once, on your first post"). No passwords.
Sessions: 15-minute access token + 30-day rotating refresh token in the phone's secure
storage. Reusing an old refresh token signs out every device in that session family.

**Whole-portion reservations.** The design states "You reserve the whole portion", so a meal is
reserved by exactly one person. Partial reservations are not supported. Enforcement is in
PostgreSQL: a row lock on the meal plus a unique index allowing one active reservation per meal.
Retries carrying the same idempotency key return the original reservation.

**Limits (sensible defaults, easy to change in `backend/app/services/food.py`).**
- Good-until must be 15 minutes to 24 hours ahead. Food cooked more than 12 hours ago is refused.
- One person can hold at most 2 active reservations.
- Hand-over is accepted up to 30 minutes after good-until; after that the reservation and meal expire.
- Collectors get a reminder 30 minutes before good-until.

**Pick-up codes.** Door pick-up: 4-digit code (as designed), shown only to the collector,
entered by the donor. 5 wrong tries lock the code; the donor can then relist the meal. Codes
die when the reservation ends. Guard pick-up: the first "Yes, collected" from either side closes
the meal.

**Privacy.** Before reserving, people see the area (e.g. "Sector 15") and distance only. The
exact address and the donor's phone are shown only to the collector holding the reservation,
and the collector's name, phone and "who is it for" only to the donor. *The design's "About this
food" screen shows the full address before reserving; this was changed for privacy.* Public
names are "First L.". Photo uploads are re-encoded, which strips location metadata.

**Additions not in the design** (needed for the brief): when-cooked chips on Share food, an
optional food photo, "Area shown to others" field, an account screen (impact, history, language,
sign out), notifications list, report food/person screens, NGO dashboard (donors coming, mark
received, close needs), and a language switch (English + हिन्दी / English / हिन्दी).

**NGOs (changed 15 Oct at the client's request).** No admin approval. An NGO registers with
an OTP-verified mobile number, its name, NGO Darpan ID / registration number, contact and address,
and can post meal needs immediately. The certificate upload is optional. Because nobody checks
documents, needs no longer show a "verified" tick. Admins can pause an NGO that misuses the app
(its needs are hidden and it cannot post) and re-enable it. Pledges count per date with no
accept/reject step, and can never exceed the need.

**Impact numbers.** "People fed" = servings of collected meals + people pledged to NGOs for dates
that have passed. Everything comes from database records.

## Decisions the client must make

1. **Food safety and liability.** "Good until" is the donor's estimate, not a safety check, and the
   app says so. Decide on: terms of use and a liability disclaimer (legal review needed under
   Indian law, including FSSAI guidance on surplus food distribution); whether commercial donors
   (restaurants, hotels) need an FSSAI licence number; whether non-veg should have a shorter
   maximum shelf time than 24 hours.
2. **NGO trust without verification.** Anyone can register as an NGO with just an OTP. Decide
   whether that risk is acceptable long term (fake NGOs collecting donated meals), or whether to
   reintroduce document checks later. Pausing an NGO from the admin dashboard is the current control.
3. **Data privacy.** Phone numbers are shared between the two sides of a reservation. Decide on a
   privacy policy (DPDP Act 2023), retention periods (suggested: delete OTP records after 2 days —
   implemented — and anonymise closed reservations after 12 months — not implemented), and
   whether to offer number masking (paid telephony) instead of showing numbers.
4. **SMS provider and DLT.** OTP SMS in India needs a DLT-registered sender ID and templates. The
   MSG91 integration expects those IDs; registration is a business task.
5. **Abuse thresholds.** Should repeated no-shows or reports suspend automatically? Today an admin
   decides.
6. **Account deletion.** Store policies require an in-app way to request account deletion. Not
   built; decide whether deletion anonymises history or erases it.
