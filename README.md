# Quick Show

A full-stack movie reservation application built with React, Vite, a Node.js HTTP API, and SQLite. Payment integration is intentionally excluded. Reservations are explicitly unpaid and are not admission tickets.

## Requirements

- Node.js **22.14 or later** (the built-in `node:sqlite` module may emit an experimental warning on Node 22).
- npm and a persistent writable disk for the database.

## Run locally

```bash
npm ci
cp .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal (usually http://localhost:5173). This starts the booking API first, then Vite, in one terminal. Vite proxies `/api` to the configured `PORT` (3001 by default). Vite handles frontend hot reload; restart this command after backend changes. Do not wrap the combined command in `node --watch`, which can restart the process when Vite generates modules. Stop any old standalone API process before using this command. For separate terminals, use `npm run dev:server` and `npm run dev:client`.

Create an account using **Sign in → Create an account**. Choose a movie and screening, select seats, acknowledge the unpaid preview, and reserve. Reservations and favourites persist across server restarts.

## Included

- Responsive movie discovery, title search, genre filters, and sorting.
- Movie details, trailer links, and a seven-day screening programme in IST.
- Account registration, sign-in, sign-out, and seven-day server-side sessions.
- Persistent, account-specific favourites and reservation history.
- Seat maps with classic and premium rows, live availability polling, and an eight-seat limit.
- Server-calculated prices and transactional seat allocation with database uniqueness constraints.
- Cancellation before showtime, seat release, printable history, and downloadable reservation summaries.
- Admin reservation overview, account counts, reserved value, and screening enable/disable controls.
- Access controls, password hashing, HTTP-only cookies, same-origin write protection, input limits, and sign-in rate limiting.
- Empty states, error handling, missing-page handling, accessible form labels, keyboard focus styles, and reduced-motion support.
- About, cinema, help, privacy, and booking terms pages.

## Administrator setup

1. Register the operator account normally.
2. Set `ADMIN_EMAIL` in `.env` to that existing account's email address.
3. Restart the API server, then refresh the app. The Admin navigation link appears.

Administrator promotion only applies to an **existing** account when the server starts; registering an email named in configuration does not automatically grant access. Removing `ADMIN_EMAIL` does not demote an existing administrator. Manage role revocation directly in the database as the operator.

An administrator can disable only screenings that have no reserved seats. Movie metadata and base prices are maintained in `src/data/data.js`; rebuilding deploys catalogue changes. Each movie has its own dedicated sample screen.

## Checks

```bash
npm run check
```

This runs ESLint, API integration tests, and the production build. Integration tests start ephemeral local HTTP servers and isolated temporary SQLite databases. They cover authentication, authorization, favourites, booking validation, trusted pricing, concurrent seat conflicts, cancellation, persistence, session expiry, past screenings, admin controls, and cross-origin write rejection.

```bash
npm run format       # Format source and documentation
npm run format:check # Check formatting
```

An optional browser smoke test uses an installed Chrome/Chromium with an isolated profile and database:

```bash
npm run test:browser
npm run test:browser:dev # Check the actual development startup and browser flow
# Override the default /usr/bin/google-chrome executable if necessary:
CHROME_PATH=/path/to/chromium npm run test:browser
```

It checks registration, show selection, seat totals, reservation, cancellation, favourites, and mobile overflow/navigation. Desktop and mobile screenshots are written to the operating system temporary directory. The browser launches with `--no-sandbox` solely for this isolated local test; never use that configuration for general browsing.

## Production build and serving

```bash
npm run build
npm start
```

The Node server serves both `dist/` and `/api`, including browser-route fallback. `npm run preview` previews the frontend build and proxies API requests to the configured backend; run `npm run dev:server` separately when using it. Use `npm start` to serve the full built application in one process.

For a real deployment, set:

```dotenv
NODE_ENV=production
PORT=3001
HOST=127.0.0.1
APP_ORIGIN=https://your-host.example
DATABASE_PATH=/persistent-volume/quickshow.sqlite
```

Put the process behind an HTTPS reverse proxy that preserves the Host header and forwards to port 3001. Production cookies require HTTPS. Set `APP_ORIGIN` to the exact public origin without a trailing slash. Use a process manager with restart-on-failure. The SQLite database must live on persistent local storage, not an ephemeral/serverless filesystem. Run a single API instance; the in-memory sign-in limiter is process-local and groups clients by connection IP. Add an edge rate limiter when deploying behind a proxy.

Back up the database with SQLite's online backup facility, or stop the server before copying the database and its WAL files. Restrict filesystem access to runtime data. Do not commit `.env`, database files, or backups.

## Scope and launch dependencies

This is a working reservation application using a **fictional venue and sample movie programme**, not a connection to real cinema inventory. The five existing movies are retained as a revival collection. Seven days of upcoming shows are generated automatically; admin-disabled shows stay disabled. Dates and times use Asia/Kolkata.

Payment collection, refunds, payment webhooks, purchased tickets, and settlement are not implemented. The application never labels an unpaid reservation as paid. Reservations remain allocated until cancellation or showtime; there is no short-lived checkout hold.

Before a public commercial launch, supply licensed/current catalogue and cinema inventory, actual venue details, reviewed operating/privacy terms, monitoring and backups, verified email and password-recovery delivery, and appropriate capacity/security testing. Poster images and trailer links depend on third-party availability. This repository does not deploy infrastructure or send email/SMS.

## Project layout

- `src/pages/`: customer and administrator screens.
- `src/components/`: navigation, footer, movie cards.
- `src/Provider.jsx`: session and favourites state.
- `src/api.js`: API client and display formatting.
- `src/data/data.js`: sample catalogue and screening times shared with the server.
- `server/app.mjs`: API, database schema, validation, and static hosting.
- `server/index.mjs`: environment configuration and process entrypoint.
- `tests/api.test.mjs`: isolated API integration tests.

No API keys or third-party accounts are required to run locally.
