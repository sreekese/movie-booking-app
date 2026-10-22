# Vercel deployment

See [VERCEL.md](./VERCEL.md) for PostgreSQL, Blob storage, data import, and deployment setup. Vercel deployments require `DATABASE_URL`; local development can still use SQLite.

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
- Database-backed movie details, trailer links, pricing, and administrator-managed screenings in IST.
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

After sign-in, administrators land on `/admin` and see only dashboard navigation. Customer-page URLs redirect administrators back to the dashboard. Customers land on `/my-bookings`, and customer visits to `/admin` redirect to their bookings.

The `/admin` dashboard has Movies, Screenings, Reservations, Accounts, and Activity sections. Administrators can:

- Add, edit, archive, restore, and delete movies, including HTTPS image/trailer URLs, genres, language, duration, rating, release date, certificate, base price, and premium surcharge.
- Add, edit, enable, disable, and delete dated screenings, with screen names and IST start times. Active screenings cannot overlap on a screen; a 15-minute turnaround is required.
- Review and cancel reservations, which releases their seats.
- Create and edit accounts and roles; delete accounts without booking history. Password hashes and session tokens are never returned to the dashboard. Role changes revoke active sessions.
- Review the latest 100 entries from the persisted administration activity log.

Changes persist immediately in SQLite and appear in the customer catalogue without rebuilding. Deletion requires confirmation. Movies with screenings must be archived or have their screenings removed first. Screenings and customers with booking history cannot be deleted; screenings with history cannot be rescheduled. Cancelled reservations remain in history. Administrators cannot delete or demote themselves. Restoring a movie does not automatically enable its screenings.

Existing reservation snapshots retain their original film details, screening, screen, and price when catalogue data changes. Printable/PDF and PNG tickets show quantity × rate for the base seat fare and premium upgrades, the booking fee, and the stored total. Duration changes require removing upcoming screenings first.

### Existing database migration

```bash
npm run db:migrate
```

This creates a consistent SQLite backup in `server/data/backups/` (or a sibling `backups/` folder beside a configured database), then runs transactional schema migration. Migration also runs on API startup; use the command above first when upgrading an existing database. The database now contains `movies`, `shows`, `users`, `sessions`, `bookings`, `seats`, `favourites`, `audit_log`, and `migrations` tables. Catalogue attributes are stored as validated JSON in the `movies.data` column; IDs and archive status are separate columns.

`src/data/data.js` is only the initial seed fixture. The first migration imports its five films and a seven-day sample programme, preserving existing accounts, shows, favourites, reservations, and reserved seats. It then records a migration marker. Later startups do not overwrite catalogue edits or recreate deleted movies/shows. New schedules are managed through the dashboard.

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

This is a working reservation application using a **fictional venue and sample movie programme**, not a connection to real cinema inventory. The five existing movies are retained as a revival collection. Seven days of sample shows are seeded once; subsequent schedules are maintained in the dashboard. Dates and times use Asia/Kolkata.

Payment collection, refunds, payment webhooks, purchased tickets, and settlement are not implemented. The application never labels an unpaid reservation as paid. Reservations remain allocated until cancellation or showtime; there is no short-lived checkout hold.

Before a public commercial launch, supply licensed/current catalogue and cinema inventory, actual venue details, reviewed operating/privacy terms, monitoring and backups, verified email and password-recovery delivery, and appropriate capacity/security testing. Poster images and trailer links depend on third-party availability. This repository does not deploy infrastructure or send email/SMS.

## Project layout

- `src/pages/`: customer and administrator screens.
- `src/components/`: navigation, footer, movie cards.
- `src/Provider.jsx`: session and favourites state.
- `src/api.js`: API client and display formatting.
- `src/data/data.js`: one-time sample seed data (not the live catalogue).
- `server/catalogue.mjs`: transactional catalogue migration, validation, and administrator CRUD APIs.
- `server/app.mjs`: API, database schema, validation, and static hosting.
- `server/index.mjs`: environment configuration and process entrypoint.
- `tests/api.test.mjs`: isolated API integration tests.

No API keys or third-party accounts are required to run locally.

### Multiple theatres

Administrators can add and edit theatre names, cities, and addresses in **Theatres**.
In **Screenings**, choose the theatre and enter its screen name/number, movie,
date, and time. Screen names are local to a theatre: two theatres can both run
Screen 1 simultaneously. Overlapping screenings on the same theatre/screen are
rejected, including the 15-minute turnaround. Each screen has its own versioned seating layout. Existing screens start with
the original 96-seat layout.

Customers can browse locations from Cinema and filter a movie’s showtimes by
theatre. Bookings and printable/downloadable tickets retain the theatre details
from reservation time, even if the location is later renamed. Theatres with
screening history cannot be deleted until those screenings can safely be removed.

The `theatres-v1` SQLite migration assigns existing screenings to Quick Show
Cinema and preserves booking snapshots. Edit that default theatre’s placeholder
city/address before using it. `npm run db:migrate` backs up the database before
migration; restart the development server after upgrading.

Admin management starts with **Theatres → Manage movies & timings**. The
**Theatre movies** view lists that location’s scheduled films; **Manage timings**
filters screenings by the selected movie. New screenings keep the selected
theatre fixed. Shared film metadata is maintained in **Movie catalogue**.

Public movie cards list theatres with upcoming, enabled screenings. The Cinema
page opens movies filtered to that location, and movie details group showtimes
under each theatre’s name and address. Disabled or past screenings do not make
a theatre appear as currently playing a movie.

### Theatre administrators and seating

The existing `admin` role is the **super administrator**. It retains access to
all theatres, shared movie metadata, and accounts. In **Accounts**, create or
edit a user, select **Theatre administrator**, and assign one or more theatres.
Assignments are stored in SQLite and changes revoke that account’s sessions.
The `theatre_admin` role can access only assigned theatres’ screenings, screen
layouts, bookings, cancellation controls, and statistics. Backend checks apply
to every management request; shared catalogue, account, and theatre editing
remain restricted to super administrators.

Open **Theatres → Manage movies & timings → Screens & seating** to configure
rows (A–Z), seats per row (1–30), aisle positions, premium rows, blocked seats,
accessible seats, and screen position. The live preview shows the layout before
saving. Prices use the film’s base fare plus its premium surcharge. New screen
names entered directly when scheduling receive the legacy 96-seat layout, so
configure custom screens before scheduling their shows.

Saving a screen layout creates a new version and updates upcoming screenings
with no booking history. Screenings with booking history keep their saved version. An unbooked screening can be edited and
saved to use the current version; screenings with booking history cannot be
changed. Reservations snapshot layouts and prices, keeping ticket amounts and
seat labels stable. The customer seat map, server seat validation, pricing, and
occupancy all use the screening’s saved layout.

**Statistics** provides date-filtered screenings, upcoming shows, reservations,
cancellations, reserved seats, occupancy, and unpaid reservation value, with a
breakdown by screening/movie/screen. Dates refer to show dates in IST. Occupancy
uses total available capacity across all screenings in the selected period.

Run `npm run db:migrate` to back up and apply `screen-access-v1`, then restart the
server. Existing accounts retain their roles and historical screenings retain
the original seating layout. Payment processing remains disabled.

Rows support multiple aisles: in **Screens & seating**, enter `3,9` under
**Aisles after seats** for gaps after seats 3 and 9. Leave the field blank for no
internal aisle. Positions must be distinct and less than the row’s seat count.
Existing single-aisle layouts continue to render unchanged; saved changes apply
to new and upcoming unbooked screenings.

To add a walkway between rows, select **Gap after row** in the screen layout
editor: Normal, Small, Medium, or Large. The additional spacing appears in the
preview and customer seat map without changing seat numbers, capacity, or
prices. Screenings with booking history keep their saved spacing.

Layout saves report how many upcoming screenings were updated and how many
were preserved because they have booking history. Past screenings are preserved.
The seat picker refreshes saved layout changes and rejects reservations submitted
with a stale layout version, allowing the customer to review their seats again.

Each row has an editable category/heading (Classic, Premium, Sofa, Recliner, VIP,
Balcony, or a custom name) and an optional whole-rupee seat price. A blank price
uses the movie base fare, with its surcharge for Premium. Consecutive rows sharing
a category and effective price display one heading. Ticket breakdowns use saved
category prices and never recalculate historical bookings from current layouts.
