# Hosting CodeSync — Vercel (frontend) + Render (backend)

Split deployment: the React app lives on Vercel, the Express/Socket.IO API on
Render. Auth uses Bearer tokens (no cookies), so cross-origin just works once
the URLs are wired below.

## 0. Prerequisites

- This repo pushed to GitHub (`main` is deployable: Vite build green, `/health` live).
- A long random `JWT_SECRET` (generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- Optional: a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster. Without it the
  backend falls back to local JSON storage (data resets on each Render redeploy).

## 1. Backend on Render

1. Go to **Render → New → Web Service**, connect this repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Health Check Path:** `/health`
3. Environment variables (`Environment` tab):

   | Key | Value |
   | --- | ----- |
   | `JWT_SECRET` | your generated secret (**required** — server exits without it) |
   | `JWT_EXPIRES_IN` | `7d` |
   | `MONGODB_URI` | Atlas connection string (optional — omit for file fallback) |
   | `FRONTEND_URL` | `https://<your-app>.vercel.app` (fill in after step 2, then redeploy) |

   Leave `PORT` unset — Render injects it automatically.
4. Deploy. Confirm `https://<your-api>.onrender.com/health` returns `{"status":"ok"}`.

## 2. Frontend on Vercel

1. Go to **Vercel → Add New → Project**, import this repo.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** `Vite` (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `build`
   - SPA rewrites are already configured in `frontend/vercel.json`.
3. Environment variable:

   | Key | Value |
   | --- | ----- |
   | `VITE_BACKEND_URL` | `https://<your-api>.onrender.com` (no trailing slash) |

4. Deploy. Open the Vercel URL — the app loads.

## 3. Wire them together

1. Copy the Vercel app URL into Render's `FRONTEND_URL` env var and **redeploy** the
   backend (CORS allowlist + Socket.IO origins come from it).
2. Full check on the Vercel URL: sign up → log in → join a room → Run Code.

## Notes

- **Free-tier sleep:** Render's free plan sleeps after inactivity; the first load or
  socket connect after sleep takes ~30–60s. Paid plans don't sleep.
- **File fallback ≠ persistent:** without `MONGODB_URI`, saved files live on Render's
  ephemeral disk and vanish on redeploy/restart. Use Atlas for real persistence.
- **Docker run mode** needs a host with Docker — Render/Vercel can't do it. The
  default **Standard** run mode works everywhere.
- **Rate limits** (per IP per 15 min): 300 API, 50 auth, 60 execute. Raise them in
  `backend/server.js` if you expect heavy classroom use.
