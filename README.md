# ES Battle — Shared backend on Vercel + Neon

Static tournament UI with **optional shared server**.
When `DATABASE_URL` is set on Vercel, **admin on any phone sees the same users, recharges, withdrawals, and rooms**.

If the API is unavailable, the app falls back to **localStorage** (device-only).

## Setup (free)

### 1. Neon Postgres
1. Create a project at https://neon.tech
2. Copy the connection string (`DATABASE_URL`)
3. Run `schema.sql` in the Neon SQL Editor

### 2. Vercel
1. Deploy this folder to Vercel
2. Project → Settings → Environment Variables:
   - `DATABASE_URL` = Neon connection string
   - `JWT_SECRET` = any long random string
3. Redeploy

### 3. Admin logins (auto-seeded)
- dudhevansh8@gmail.com / 2345678910$$
- samarthkhamele@gmail.com / samarth333

You should see: "Connected to shared server — data syncs across devices."

## API
- GET /api/health
- POST /api/auth/register | /api/auth/login
- GET /api/auth/me
- GET /api/admin/users
- GET|POST|PATCH /api/admin/recharges
- GET|POST|PATCH /api/admin/withdraws
- GET|PUT /api/rooms?matchId=lonewolf|cs1v1
- POST /api/matches/join
- GET /api/matches/status?matchId=...

Auth: `Authorization: Bearer <token>`


### ESM deployment fix
This project uses ES module syntax (`import` / `export`) in both browser and Vercel API files.
`package.json` includes `"type": "module"` so Vercel/Node treats `.js` files as ESM instead of recompiling them to CommonJS.
