# Merch For The Future

A storefront for Merch For The Future, a webstore selling our all human designed droppshipped apparel with a focus on sustainability and building positive visions of the future.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| ORM | Prisma 7 (with Neon driver adapter) |
| Auth | NextAuth.js v5 (credentials + JWT sessions) |
| Payments | Stripe (Connect for seller payouts) |
| Image hosting | Vercel Blob |
| Email | Resend |
| Print fulfillment | Prodigi |
| Tax calculation | TaxJar |
| Testing | Vitest + Testing Library + Playwright |
| API mocking | MSW (Mock Service Worker) |
| Deployment | Vercel |

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database
- `npm` (or compatible package manager)

## Local Setup

### 1. Clone and install

```bash
git clone git@github.com:CollectionOfAtoms/MerchForTheFuture.git
cd MerchForTheFuture
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in your values. The minimum required to run locally:

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Your Neon connection string (pooled) |
| `DATABASE_URL_TEST` | A separate Neon branch or database for tests |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` |

External service keys are not required to run the app locally — they are mocked in tests. Stripe, Prodigi, Resend, and Vercel Blob are all integrated. See the sections below for one-time setup steps.

### 3. Apply database migrations

```bash
npm run db:migrate
```

This runs all Prisma migrations against your `DATABASE_URL` database.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start local dev server with Turbopack |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Run unit + integration test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with V8 coverage report |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Push schema changes without a migration file |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

## Prodigi Integration

Print fulfillment is handled by [Prodigi](https://www.prodigi.com).

### Sandbox vs. live API

Prodigi provides a sandbox environment at `https://api.sandbox.prodigi.com/v4.0` that accepts orders without triggering real fulfillment or charges. Use a sandbox API key (starts with `test_`) from [dashboard.prodigi.com](https://dashboard.prodigi.com) for local development and staging.

Set these two variables in `.env.local`:

```
PRODIGI_API_KEY="test_..."                                   # sandbox key
PRODIGI_API_BASE_URL="https://api.sandbox.prodigi.com/v4.0" # sandbox endpoint
```

In production (Vercel), set `PRODIGI_API_KEY` to your live key and leave `PRODIGI_API_BASE_URL` unset — the app defaults to the live endpoint automatically.

> **Never set `PRODIGI_API_BASE_URL` in production.** The default is the live API; setting the variable explicitly is only needed to point at the sandbox.

### Print Catalog Maintenance

Two one-time setup scripts manage the static catalog data the app relies on at runtime.

### Discover available SKUs

Prodigi's API has no catalog-listing endpoint. Run this script to probe all candidate sizes and output a verified list:

```bash
PRODIGI_API_KEY=your_key npx tsx scripts/probe-prodigi-catalog.ts
```

The script queries `/v4.0/products/{sku}` for each candidate, prints ✓/✗ per SKU, then outputs a ready-to-paste `PRINT_CATALOG` constant. Paste the output into `src/lib/print/listing.ts`.

### Update fulfillment cost estimates

The seller edit form shows estimated Prodigi costs (~$X per size) sourced from `src/lib/print/costs.json`. Regenerate after any Prodigi pricing changes:

```bash
PRODIGI_API_KEY=your_key npx tsx scripts/fetch-prodigi-costs.ts
```

Commit the updated `costs.json`. No API calls are made at runtime — costs are bundled statically at build time.

## Project Structure

```
src/
  app/              # Next.js App Router pages and API routes
    admin/tracker/  # Admin-only development progress dashboard
  auth.ts           # NextAuth config (Prisma adapter, credentials provider)
  auth.config.ts    # Edge-safe auth config (used by proxy/middleware)
  proxy.ts          # Route protection (ADMIN guard for /admin/*)
  lib/
    db.ts           # Prisma client singleton (Neon adapter)
    auth/           # Registration, login, seller onboarding logic
    artworks/       # Artwork CRUD, image handling, listing management
    print/          # Prodigi catalog, cost estimates, order creation, tracking
    payments/       # Stripe webhook fulfillment, seller payouts
    dashboard/      # Seller/buyer dashboard queries

prisma/
  schema.prisma     # Database schema

__tests__/
  epic-*/           # Integration tests per user story (run in Node env)
  components/       # Component tests (run in jsdom)
  helpers/db.ts     # Test database reset utility
  mocks/            # MSW handlers for external APIs

scripts/
  probe-prodigi-catalog.ts  # One-time: discover valid Prodigi SKUs
  fetch-prodigi-costs.ts    # One-time: populate costs.json from Prodigi quotes API

spec/
  project-tracker.json        # Story-by-story development progress
  user-stories-art-marketplace.md  # Full spec and acceptance criteria
```

## Testing

Tests follow a strict TDD cycle — tests are written before implementation, confirmed failing (red), then implementation makes them pass (green).

```bash
# Run all tests
npm test

# Run a specific epic
npx vitest run __tests__/epic-6-auth

# Run with coverage
npm run test:coverage
```

Integration tests hit a real database (configured via `DATABASE_URL_TEST`). The test suite resets the database between test files automatically.

External APIs (Stripe, Prodigi, TaxJar, Resend) are mocked via MSW for HTTP-based SDKs and `vi.mock()` for Node SDK clients.

## Admin Dashboard

Development progress is visible at `/admin/tracker` — accessible only to users with the `ADMIN` role. It shows per-epic progress bars and per-story status across all epics.

## Development Status

| Epic | Description | Status |
|---|---|---|
| Epic 1 | Artwork Listing & Product Page | ✅ Complete (6/6) |
| Epic 2 | Fixed-Price Sales | ✅ Complete (4/4) |
| Epic 3 | Auction Sales | ✅ Complete (6/6) |
| Epic 4 | Payments | ✅ Complete (4/5 — US-4.3 Stripe Tax deferred) |
| Epic 5 | Tax Calculation | 🔲 Not started |
| Epic 6 | User Accounts & Authentication | ✅ Complete (2/3 — US-6.3 dropped) |
| Epic 7 | Browsing & Discovery | ✅ Complete (4/4) |
| Epic 8 | Print Shop | ✅ Complete (6/6) |
| Epic 9 | Seller Dashboard & Listing Management | ✅ Complete (6/6) |
| Epic 10 | Browse & Product Page UX | ✅ Complete (2/2) |
| Epic 11 | Seller Listing Lifecycle | ✅ Complete (3/3) |
| Epic 12 | Buyer Experience | ✅ Complete (4/4) |
| Epic 13 | Role-Based Dashboards | ✅ Complete (3/3) |
| Epic 14 | Post-Sale Fulfillment | ✅ Complete (7/7) |
| Epic 15 | Listing-Page Purchase & Print Availability | ✅ Complete (7/7) |

## Deployment

The `main` branch deploys automatically to Vercel on push. Feature branches get a Vercel preview deployment when a pull request is opened.

Required environment variables must be set in the Vercel project settings — see `.env.local.example` for the full list.
