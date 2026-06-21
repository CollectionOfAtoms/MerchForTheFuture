# Merch For The Future

A direct-to-consumer storefront for **Merch for the Future** — sustainability-focused
apparel and exclusively human-made fine art, built around optimistic, climate-forward
design. Apparel is drop-shipped (Teemill, Prodigi); fine-art **prints** are drop-shipped
(Prodigi); fine-art **originals** are shipped by the seller.

> **This is a modified stack.** The installed Next.js (16.2.x App Router) and Stripe SDK
> carry breaking changes vs. their public releases — always trust the installed types and
> read `node_modules/next/dist/docs/` before writing routing/data-fetching code. See
> `AGENTS.md` and `spec/project-description.md` for the architectural ground truth.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (tokens in `src/app/globals.css` `@theme`; no `tailwind.config.ts`) |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| ORM | Prisma 7 (Neon driver adapter; client generated to `@/generated/prisma/client`) |
| Auth | NextAuth.js v5 (credentials + JWT sessions) |
| Payments | Stripe **embedded** Checkout (single-seller model — no Stripe Connect) |
| Image hosting | Vercel Blob |
| Email | MailerSend |
| Apparel fulfillment | **Teemill** (primary; `REFERENCED` product-ref model) · **Prodigi** (`DESIGNED` blank model) |
| Fine-art prints | Prodigi |
| Tax | Stripe Tax — wired in Epic 5, currently **disabled** behind `STRIPE_TAX_ENABLED` |
| Testing | Vitest + Testing Library + Playwright |
| API mocking | MSW (Stripe, Prodigi, Teemill, TaxJar, MailerSend) |
| Deployment | Vercel |

## Prerequisites

- Node.js 20+ (22/24 fine)
- A [Neon](https://neon.tech) PostgreSQL database (plus a second branch/database for tests)
- [`mkcert`](https://github.com/FiloSottile/mkcert) — the dev server runs over **HTTPS**

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

Fill in your values. The minimum required to run locally:

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Your Neon connection string (pooled) |
| `DATABASE_URL_TEST` | A separate Neon branch or database for tests |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://localhost:3000` |
| `NEXT_PUBLIC_BASE_URL` | `https://localhost:3000` (used for email links + provider callbacks) |

External service keys (Stripe, Prodigi, Teemill, MailerSend, TaxJar, Vercel Blob) are
**not required to run the test suite** — they are mocked via MSW. They are needed to
exercise the corresponding live flows in the running app.

### 3. Generate the local HTTPS certificate

The dev server runs with `--experimental-https` (NextAuth cookies + RSC payloads behave
correctly only over a trusted origin). Generate a mkcert cert into `certificates/`
(git-ignored):

```bash
mkcert -install
mkcert -cert-file certificates/localhost.pem -key-file certificates/localhost-key.pem \
  localhost 127.0.0.1 ::1
```

### 4. Apply the database schema

```bash
npm run db:push
```

This project uses `prisma db push` (not migration files) due to historical schema drift.
After any `schema.prisma` change, run `db:push` against both `DATABASE_URL` and your test
database, then restart the dev server (it caches a stale Prisma client otherwise).

### 5. Start the development server

```bash
npm run dev
```

Open [https://localhost:3000](https://localhost:3000) (accept the local cert warning).

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the HTTPS dev server (Turbopack; runs `prisma generate` first) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest unit + integration suite |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with V8 coverage |
| `npm run test:e2e` | Playwright end-to-end tests (separate from `npm test`) |
| `npm run db:push` | Push `schema.prisma` to the database (preferred) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | `prisma migrate dev` (rarely used — `db:push` is the norm here) |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

## Dropshipper Integration

All providers sit behind the shared fulfillment abstraction in `src/lib/fulfillment/`
(`FulfillmentProvider` abstract base + factory). A multi-item cart is split into
per-provider shipments; buyers only ever see "Shipment 1 of 2", never a provider name.

### Teemill (primary apparel — `REFERENCED`)

The founder builds a product on Teemill; the app ingests the catalog entry (colours, sizes,
mockups, base price, orderable variant refs) into a cached snapshot. Teemill is
**print-on-demand**: a variant is orderable when it can be printed on demand (`gfnVariant`)
**or** has warehouse stock — not warehouse `stock.level` alone. Auth uses the raw API key
(no `Bearer`) with `?project={sub}`. No sandbox exists; MSW stubs cover tests. See
`docs/teemill-api-notes.md`.

### Prodigi (fine-art prints + `DESIGNED` apparel)

Prodigi provides a sandbox at `https://api.sandbox.prodigi.com/v4.0`. Use a sandbox key
(`test_...`) for local/staging:

```
PRODIGI_API_KEY="test_..."
PRODIGI_API_BASE_URL="https://api.sandbox.prodigi.com/v4.0"
```

In production set `PRODIGI_API_KEY` to your live key and **leave `PRODIGI_API_BASE_URL`
unset** — the app defaults to the live endpoint. See `docs/prodigi-api-notes.md`.

**Print catalog scripts** (Prodigi has no catalog-listing endpoint):

```bash
PRODIGI_API_KEY=your_key npx tsx scripts/probe-prodigi-catalog.ts   # discover valid SKUs
PRODIGI_API_KEY=your_key npx tsx scripts/fetch-prodigi-costs.ts      # refresh costs.json
```

Paste the SKU output into `src/lib/print/listing.ts`; commit the regenerated
`src/lib/print/costs.json`. No catalog API calls happen at runtime.

## Project Structure

```
src/
  app/(main)/        # App Router pages (storefront, seller, admin, buyer, checkout)
    admin/           # Admin: products, users, tracker, fulfillment (dropship exceptions)
    seller/          # Seller: listings, apparel, fulfillment (originals to ship)
    api/             # Webhooks (Stripe, Prodigi) + cron routes
  auth.ts            # NextAuth config (credentials provider, JWT)
  components/        # Shared UI (Nav, cart, checkout, order views)
  lib/
    db.ts            # Prisma client singleton (Neon adapter)
    apparel/         # Apparel listings — DESIGNED + REFERENCED read-shape, sizes/colours
    artworks/        # Artwork CRUD, image variant pipeline (watermarking)
    cart/            # DB-backed guest-capable cart
    checkout/        # Cart revalidation, per-provider shipping quote, fan-out, shipments
    fulfillment/     # Provider abstraction, status seam, Teemill ingest, originals, admin
    payments/        # Stripe checkout/webhook fulfillment, transactional email
    print/           # Prodigi catalog, cost estimates, order creation, tracking
    account/ orders/ dashboard/ auctions/ tax/ seller/
  generated/prisma/  # Generated Prisma client (import from @/generated/prisma/client)

prisma/schema.prisma # Database schema

__tests__/
  epic-*/  mftf-*/   # Per-story tests (Node env by default; jsdom via docblock)
  e2e/               # Playwright specs + committed visual snapshots
  helpers/db.ts      # Test database reset utility
  mocks/             # MSW handlers for external APIs

scripts/             # One-off + dev tooling (Prodigi catalog, demo orders, shipment sims)

spec/
  project-tracker.json             # Authoritative per-story status + epic order
  user-stories-art-marketplace.md  # Full spec and acceptance criteria
  project-description.md           # Vision, tech rationale, design principles (living doc)

docs/                # Live-verified provider API notes (Teemill, Prodigi)
```

## Testing

Strict TDD — tests are written first (red), then implementation makes them pass (green).

```bash
npm test                                   # full Vitest suite
npx vitest run __tests__/mftf-15-seller-fulfillment   # one epic/folder
npm run test:coverage                      # with coverage
npm run test:e2e                           # Playwright (separate from npm test)
```

Integration tests hit a real database (`DATABASE_URL_TEST`) and reset it between files.
External APIs are mocked via MSW (HTTP SDKs) and `vi.mock()` (Node SDK clients) — no live
calls in any test. The suite can be flaky under parallelism against the shared Neon test
branch; for a trustworthy result run `npx vitest run --no-file-parallelism`.

## Roles & Dashboards

- **Buyer** — browse without an account; purchasing requires auth; receives transactional
  email.
- **Seller** — manages listings and ships their own physical originals from
  `/seller/fulfillment`.
- **Admin** — site config, user/role management, and the dropship-exception retry queue at
  `/admin/fulfillment`. Drop-shipped fulfillment is fully automated (no human enters
  dropship tracking).

Live, per-story development progress is visible at `/admin/tracker` (ADMIN-only) and in
`spec/project-tracker.json`.

## Development Status

Core commerce is built and green: artwork listings, fixed-price + auction sales, payments
(Stripe embedded Checkout), accounts/auth, browse/search, the print shop, seller/admin
dashboards, the apparel storefront (both sourcing modes), the DB-backed cart, multi-provider
checkout & fan-out, provider webhooks + canonical status mapping + buyer lifecycle emails,
and seller fulfillment for originals (Epic MFTF-15). Next up: Epic 5 (Tax — re-enable
Stripe `automatic_tax`) and Epic MFTF-16 (storefront/catalog corrections).

`spec/project-tracker.json` is the source of truth for status; this section is a summary.

## Deployment

`main` deploys automatically to Vercel on push; pull requests get preview deployments.
Set all required environment variables in the Vercel project settings — see
`.env.local.example` for the full list. **Never set `PRODIGI_API_BASE_URL` in production**
(the default is the live API; the variable only exists to point at the sandbox).
