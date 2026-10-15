# Anndaan

Share surplus cooked food with people and NGOs nearby. English + Hindi.

```
annadaan/
  mobile/          React Native (Expo SDK 57, Expo Router, TypeScript)
  backend/         FastAPI + SQLAlchemy 2 (async) + PostgreSQL/PostGIS + Alembic
  admin/           React + Vite admin dashboard (no UI libraries)
  infrastructure/  Caddy, backup/restore scripts, Dockerfiles
  shared/          openapi.json: the contract both front-ends generate types from
  design/          the original HTML screen designs
  docs/            product decisions and open questions for the client
  docker-compose.yml       production stack (one VPS)
  docker-compose.dev.yml   local PostGIS only, if you have Docker
```

## Local development

### 1. Database (PostgreSQL + PostGIS on port 5433)

With Docker:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Without Docker (Windows, as used to build this): a project-local Postgres 18 + PostGIS 3.6
lives in `.tools/` (git-ignored) and runs with trust auth on 127.0.0.1:5433:

```bash
.tools/pg/bin/pg_ctl.exe -D .tools/pgdata -l .tools/pg.log start
```

Databases: `annadaan` (dev) and `annadaan_test` (tests).

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.cli create-admin +91XXXXXXXXXX "Your Name"
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. In development `OTP_DEV_MODE=true`, so the SMS code is
returned by the API and shown on screen; no SMS is sent.

Tests (need the test database):

```bash
.venv/Scripts/python -m pytest -q
```

### 3. Mobile app

```bash
cd mobile
npm install
npx expo start              # scan the QR code with a development build or Expo Go
```

The app finds the backend automatically on the machine running Metro (port 8000). To point
elsewhere: `EXPO_PUBLIC_API_URL=https://api.example.in npx expo start`.

Push notifications, location and image picking need a **development build** on a real device
(`npx expo run:android`, or `npx eas-cli build --profile development`). Set
`expo.extra.eas.projectId` in `app.json` (from `npx eas-cli init`) for push tokens.

Checks: `npm run typecheck` and `npx expo lint`.

### 4. Admin dashboard

```bash
cd admin
npm install
npm run dev                 # http://localhost:5173, proxies /api to :8000
```

Sign in with the admin number you created; the dev OTP is shown on screen.

### Regenerating API types

After changing backend schemas:

```bash
cd backend && .venv/Scripts/python -m app.cli export-openapi ../shared/openapi.json
cd ../mobile && npm run gen:api
cd ../admin && npm run gen:api
```

## Production (single VPS)

Target: Ubuntu 24.04, 2 vCPU / 4 GB RAM. Only ports 22, 80 and 443 open.

```bash
# on the server
sudo apt update && sudo apt install -y docker.io docker-compose-v2 ufw
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
git clone <repo> annadaan && cd annadaan
cp .env.example .env && nano .env     # domains, secrets, MSG91, backup bucket
docker compose up -d --build
docker compose exec api python -m app.cli create-admin +91XXXXXXXXXX "Admin Name"
```

- Point DNS A records for `API_DOMAIN` and `ADMIN_DOMAIN` at the server first; Caddy gets
  HTTPS certificates automatically.
- Migrations run on every API start (`alembic upgrade head`).
- The API refuses to start in production with `OTP_DEV_MODE=true`, a weak `JWT_SECRET`, or
  `SMS_PROVIDER=console`.
- Scheduled work (expiry, reminders, closing finished NGO needs, cleanup) runs inside the API
  every minute, guarded by a Postgres advisory lock.
- Backups: the `backup` service runs `pg_dump` + uploads nightly, keeps 7 days locally and copies
  to off-site storage (Backblaze B2 or Cloudflare R2 via rclone env vars). Run one now:
  `docker compose exec backup /backup.sh now`. Restore: `docker compose exec backup /restore.sh /backups/<file>.dump`.
- Logs: `docker compose logs -f api` (rotated at 10 MB × 5 per service).
- Updates: `git pull && docker compose up -d --build`.

Build the mobile app for the stores with EAS (`npx eas-cli build -p android --profile production`),
with `EXPO_PUBLIC_API_URL=https://<API_DOMAIN>` set in `eas.json` or the EAS environment.

## Environment variables

See `.env.example` (production) and `backend/.env.example` (development). Key ones:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Database password (random, 32+ chars) |
| `JWT_SECRET` | Signs access tokens and keys OTP/refresh hashes (random, 48+ bytes) |
| `OTP_DEV_MODE` | `true` only in development: returns OTPs in API responses |
| `SMS_PROVIDER`, `MSG91_*` | SMS for OTPs and NGO verification results (DLT templates required in India) |
| `EXPO_ACCESS_TOKEN` | Only if Expo enhanced push security is enabled |
| `API_DOMAIN`, `ADMIN_DOMAIN`, `ACME_EMAIL` | Caddy HTTPS |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API |
| `RCLONE_CONFIG_OFFSITE_*`, `OFFSITE_BUCKET` | Off-site backup target |
| `EXPO_PUBLIC_API_URL` (mobile) | API base URL baked into app builds |

## Product rules implemented

See [docs/decisions.md](docs/decisions.md) for behaviour choices and the questions the client
still needs to answer (food safety, liability, NGO verification, privacy).
"# Anndaan-app" 
