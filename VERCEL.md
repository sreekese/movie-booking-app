# Deploy Quick Show to Vercel

This repository deploys the React/Vite frontend and the Node API in one Vercel
project. PostgreSQL persists accounts, films, theatres, layouts, sessions and
bookings. A **public Vercel Blob store** persists uploaded poster/banner images.
Static assets are deployed from `public/` and the Vite build. Tickets are generated
in the browser; no ticket files or SQLite databases are written on Vercel.

## 1. Connect persistent storage

In your Vercel project, connect a PostgreSQL database through Storage/Marketplace
(for example, Neon). Copy the provider's **pooled PostgreSQL connection URL** into
an environment variable named `DATABASE_URL`. Keep the provider's SSL parameters.
The app uses the `pg` driver and does not disable certificate validation.

Create and connect a **public Blob store**. Ensure its `BLOB_READ_WRITE_TOKEN` is
available to the project. Blob is optional if you only use existing HTTPS image
URLs. Uploads are restricted to super administrators and PNG/JPEG/WebP files up to
2 MB. Uploaded images are public, so do not upload private documents or tickets.

Environment variables (server-only, never `VITE_`):

| Variable                | Required      | Purpose                                               |
| ----------------------- | ------------- | ----------------------------------------------------- |
| `DATABASE_URL`          | Yes on Vercel | PostgreSQL connection URL                             |
| `BLOB_READ_WRITE_TOKEN` | For uploads   | Public Blob store credential                          |
| `APP_ORIGIN`            | Optional      | Canonical HTTPS origin; omit for same-origin previews |

Use separate database and Blob stores for Preview and Production if previews
must not edit production data. Redeploy after changing environment variables.
Do not set `DATABASE_PATH` on Vercel or commit `.env` / SQLite files to Git.

## 2. Import existing data OR start empty

**To keep your local data:** first run `npm run db:migrate` locally with
`DATABASE_URL` unset. This backs up and upgrades your SQLite database. Stop the
local app while importing so no bookings are created after the snapshot.

Then put the hosted target `DATABASE_URL` in your local `.env` and run:

```sh
npm run db:import -- server/data/quickshow.sqlite
```

The importer opens the source read-only, requires an empty destination, copies
all application records in one transaction, validates counts, and resets ID
sequences. It preserves password hashes, roles, assignments, layouts, favourites,
audit history and booking snapshots. It deliberately excludes login sessions and
rate limits; users sign in again. Existing image URLs remain unchanged. Local
files outside the database are not automatically uploaded; upload those through
the admin movie editor or enter a hosted HTTPS URL.

**To start with an empty database:** set `DATABASE_URL` locally and run
`npm run db:migrate`. No sample movies, screenings or users are seeded into hosted
PostgreSQL. The schema also initializes safely on the first API invocation.

For a fresh admin account, temporarily set `ADMIN_EMAIL`, `ADMIN_PASSWORD`
(12–128 characters) and optionally `ADMIN_NAME` in your local `.env`, then run:

```sh
npm run db:admin
```

For an existing imported account, `ADMIN_EMAIL` alone promotes that account; its
password is unchanged. Remove `ADMIN_PASSWORD` afterward. Do not add it to Vercel.
Your already imported admin accounts need no additional provisioning.

## 3. Push and deploy

Commit and push the changes to the Git branch connected to Vercel. Configure:

- Framework preset: **Vite**
- Root directory: repository root
- Node.js: **22.x**
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

`vercel.json` sends `/api/*` to `api/index.mjs` before the SPA fallback. React routes
such as `/admin`, `/my-bookings`, and `/movies/1` support direct navigation and
refresh. The API and browser share the same origin; no cross-site cookies or
frontend API URL are needed. Do not configure `npm start` as a Vercel build step.

## 4. Verify after deployment

1. Open `/api/health`: expect JSON `{ "status": "ok" }`.
2. Sign in as your admin and confirm theatre assignments and historical bookings.
3. Create a future screening (imported show dates may already be past).
4. Upload a poster in Movie catalogue and confirm its URL loads after redeploying.
5. Reserve seats as a customer, check the amount split, then cancel the booking.
6. Refresh `/my-bookings` directly and verify the page and session still work.

If `/api/health` returns 503, check DATABASE_URL and Vercel function logs. If it
returns HTML, verify the deployed commit includes `vercel.json` and the root
`api/` folder. If writes return `Invalid request origin`, remove an outdated
`APP_ORIGIN` or set it to the exact deployed origin. If upload fails with a storage
configuration error, connect a public Blob store and redeploy.

## Local development and validation

`npm run dev` uses SQLite when DATABASE_URL is absent, or PostgreSQL when it is
set. Existing SQLite migration/backup support remains available. `npm run check`
validates the local mode; `npm run test:browser` exercises the production frontend.

To run the full API suite against an expendable PostgreSQL database, set
`TEST_DATABASE_URL` and run `npm run test:postgres`. Tests use isolated temporary
schemas and remove them. Never point test configuration at a production account.

The database serializes writes with a transaction-scoped advisory lock. This
preserves seat uniqueness and coordinates layout/admin changes across function
instances. For substantially higher traffic, replace this conservative lock with
resource-specific locks and measure query latency. Connection pools are small
and idle connections expire; use the provider's pooled URL for serverless hosts.

Live database and Blob provisioning requires your accounts and credentials.
Local verification cannot prove your provider's permissions, billing limits, or
Vercel deployment environment. Uploaded files that aren't saved onto a movie
remain in Blob and can be removed through its dashboard.

References: [Vite deployment](https://vercel.com/docs/frameworks/frontend/vite),
[rewrites](https://vercel.com/docs/rewrites),
[Blob server uploads](https://vercel.com/docs/vercel-blob/server-upload),
[node-postgres transactions](https://node-postgres.com/features/transactions).
