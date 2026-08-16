# ES Battle — Shared backend on Vercel + Neon

Static tournament UI with **optional shared server**.
When `DATABASE_URL` is set on Vercel, **admin on any phone sees the same users, recharges, withdrawals, and rooms**.

If the API is unavailable, the app falls back to **localStorage** (device-only).

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
