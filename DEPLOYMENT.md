# Deployment Guide

Everything in this guide has been tested locally against Wrangler 4.107.0
and a real D1 instance. The commands below need to run on YOUR machine —
they require an authenticated Cloudflare session (`wrangler login` opens
a browser for OAuth), which isn't something that can be done from a
sandboxed build environment.

Total time: roughly 10-15 minutes, most of it waiting on `npm install`.

---

## Prerequisites

- Node.js 18+ installed
- A Cloudflare account (free tier is enough for this)
- This repo cloned/downloaded to your machine

---

## Step 1 — Authenticate Wrangler

```bash
cd worker
npm install
npx wrangler login
```

This opens a browser window asking you to authorize Wrangler against
your Cloudflare account. Approve it, then return to the terminal.

Confirm it worked:

```bash
npx wrangler whoami
```

You should see your account email/ID printed, not "You are not
authenticated."

---

## Step 2 — Create the real D1 database

```bash
npx wrangler d1 create productivity-db
```

This prints output that includes a `database_id`, looking like:

```
[[d1_databases]]
binding = "DB"
database_name = "productivity-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy that `database_id` value.** Open `worker/wrangler.toml` and
replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with it:

```toml
[[d1_databases]]
binding = "DB"
database_name = "productivity-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # <- your real ID here
```

---

## Step 3 — Apply the schema and seed data to the REAL database

Note the `--remote` flag — without it, this applies to a local
simulation instead of your actual cloud database.

```bash
npx wrangler d1 execute productivity-db --remote --file=../schema/schema.sql
npx wrangler d1 execute productivity-db --remote --file=../schema/seed.sql
```

Verify it worked:

```bash
npx wrangler d1 execute productivity-db --remote --command="SELECT COUNT(*) as c FROM languages;"
```

Should return `14`.

---

## Step 4 — Set the API key secret

Pick a real secret value — a long random string is fine, e.g. generate
one with `openssl rand -hex 32` — and set it:

```bash
npx wrangler secret put API_KEY
```

This prompts you to paste the value. It's stored encrypted by
Cloudflare, never written to any file in this repo.

**Write this value down somewhere** — you'll need the exact same value
in the frontend's `.env.local` in Step 6.

---

## Step 5 — Deploy the Worker

```bash
npx wrangler deploy
```

This prints a URL when done, looking like:

```
https://productivity-system-api.<your-subdomain>.workers.dev
```

**Copy this URL.** Confirm it's live:

```bash
curl https://productivity-system-api.<your-subdomain>.workers.dev/health
```

Should return `{"status":"ok","time":"..."}`.

---

## Step 6 — Configure the frontend for production

```bash
cd ../frontend
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_API_BASE_URL=https://productivity-system-api.<your-subdomain>.workers.dev
VITE_API_KEY=<the exact secret value you set in Step 4>
```

---

## Step 7 — Build and deploy the frontend to Cloudflare Pages

```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name=productivity-system
```

First run will ask you to confirm creating a new Pages project — say
yes. This prints a URL when done, looking like:

```
https://productivity-system.pages.dev
```

**This is the URL you open on your phone and laptop.**

---

## Step 8 — Lock down CORS (recommended, not required to function)

Right now the Worker accepts requests from any origin (`origin: "*"`
in `worker/src/index.ts`). Once you have your real Pages URL, tighten
this:

Open `worker/src/index.ts`, find:

```typescript
const { preflight, corsify } = cors({
  origin: "*", // tighten this to your actual frontend origin once deployed
  ...
```

Change to:

```typescript
const { preflight, corsify } = cors({
  origin: "https://productivity-system.pages.dev",
  ...
```

Then redeploy the Worker:

```bash
cd ../worker
npx wrangler deploy
```

This isn't required for the app to work, but it means only requests
from your actual deployed frontend are accepted — a reasonable
tightening now that you know the real URL, rather than leaving it
open indefinitely.

---

## Updating after this initial deploy

Whenever you make changes:

**Backend changes** (`worker/src/**`, or a schema change):
```bash
cd worker
npx wrangler deploy
# If schema.sql changed:
npx wrangler d1 execute productivity-db --remote --file=../schema/schema.sql
```

**Frontend changes**:
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=productivity-system
```

---

## Troubleshooting

**"D1_ERROR: no such table"** — Step 3 wasn't run against `--remote`,
or was run before Step 2's database_id was saved into wrangler.toml.

**Frontend loads but every action fails / network errors** — check
`.env.local`'s `VITE_API_BASE_URL` has no trailing slash and matches
the Worker URL exactly, and that `VITE_API_KEY` matches the secret set
in Step 4 exactly (no extra whitespace).

**CORS errors in the browser console** — if you did Step 8, confirm
the `origin` value exactly matches your Pages URL including `https://`
and no trailing slash.
