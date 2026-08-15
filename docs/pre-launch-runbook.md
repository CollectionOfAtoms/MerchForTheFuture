# Pre-Launch Runbook — Epic MFTF-10

**Status:** Prepared 2026-07-10. All eight US-MFTF-10.x stories are founder-operational
tasks — none are TDD code stories. This runbook is the code/config half of the epic:
exact commands, the production env-var checklist, and the (founder-gated) go-live code
change. The founder checklist half is the story list itself; work it in the dependency
order below.

**Dependency order:** 10.3 → 10.4 → 10.5 → 10.6 → 10.7 → 10.8, with 10.1 and 10.2
parallelizable once billing exists. US-MFTF-10.8 (go live) is last and requires both
founders' sign-off.

---

## Founder task checklist (no code)

| Story | Task | Blocked by |
|---|---|---|
| US-MFTF-10.3 | Register the business entity (LLC or equivalent), obtain EIN | — |
| US-MFTF-10.4 | Open business checking account + business card | 10.3 |
| US-MFTF-10.5 | Stripe activation (business info, payout bank, tax details); add the business card to Teemill and Prodigi billing | 10.3, 10.4 |
| US-MFTF-10.6 | Order samples (Teemill; Prodigi if evaluating apparel there); assess against the material standard; enter selected product types in the admin catalog | 10.5 |
| US-MFTF-10.7 | Create ≥10 original designs, shoot lifestyle photos from QA samples, publish listings on production, visual review | 10.6, plus 10.1/10.2 (production must exist to publish on it) |
| US-MFTF-10.8 | Go live (see the gated code change at the bottom) | everything above |

---

## US-MFTF-10.1 — Provision the production database (Neon)

1. In the Neon console, create a **new branch** (or a separate project) named e.g.
   `production`, branched from an **empty root** — do not branch from the dev branch
   (that would copy dev data into prod).
2. Copy the **pooled** connection string (the `-pooler` host). Prisma runs through the
   Neon driver adapter; the pooled string is what `DATABASE_URL` expects (same as dev).
3. Apply the schema from your machine (one-off; do **not** point `.env.local` at prod):

   ```bash
   DATABASE_URL="<prod pooled connection string>" npx prisma db push
   ```

   This project uses `db push`, never `prisma migrate` (historical schema drift on
   `Order.stripeSessionId`). Against the **empty** prod database a plain `db push` is
   safe; never add `--accept-data-loss` against production once it holds live data.
4. In Vercel → Project → Settings → Environment Variables, set `DATABASE_URL` for the
   **Production** environment only to the prod string. Leave Preview/Development on the
   dev database.
5. Verify isolation: create a throwaway row in production (e.g. sign up a test account
   on the prod URL), confirm it does **not** appear in the dev DB, then clean it up.

**Repeat step 3 after every future `schema.prisma` change** — the existing convention
(push to `DATABASE_URL` + `DATABASE_URL_TEST`) gains a third target:

```bash
npx prisma generate
npx prisma db push                       # dev DB (.env.local)
DATABASE_URL="$(grep '^DATABASE_URL_TEST=' .env.local | sed 's/^DATABASE_URL_TEST=//' | tr -d '"')" npx prisma db push   # test DB
DATABASE_URL="<prod pooled connection string>" npx prisma db push               # prod DB
```

(Vercel's build runs `prisma generate` — the client is always fresh — but nothing
applies schema automatically; the push is always manual and deliberate.)

---

## US-MFTF-10.2 — Production environment variables (Vercel)

Full inventory of env vars the app actually reads (audited 2026-07-10 against `src/` +
`scripts/`). `.env.local.example` was refreshed to match in the same commit as this
runbook. Set these in Vercel for the **Production** environment; sandbox/test values
stay in `.env.local` and Preview.

### Required in production

| Variable | Production value | Notes |
|---|---|---|
| `DATABASE_URL` | prod Neon pooled string | US-MFTF-10.1 |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | fresh `openssl rand -base64 32` | generate a **new** secret for prod (don't reuse dev); NextAuth v5 reads `AUTH_SECRET`, the legacy name is kept in parallel |
| `NEXTAUTH_URL` | `https://<prod domain>` | must be `https://` (BUG-2) |
| `NEXT_PUBLIC_BASE_URL` | `https://<prod domain>` | **critical:** email links AND Prodigi webhook callbacks self-address with this — a wrong value silently breaks order-status flow (see docs/prodigi-api-notes.md, Webhooks) |
| `STRIPE_SECRET_KEY` | `sk_live_…` | live mode |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` | live mode |
| `STRIPE_WEBHOOK_SECRET` | from the **prod** webhook endpoint | create a live-mode endpoint in the Stripe dashboard pointing at `https://<prod domain>/api/webhooks/stripe`; the signing secret is per-endpoint |
| `TEEMILL_API_KEY` | live key from teemill.com/api | raw key in `Authorization`, **no `Bearer`**; the `?project=` param is auto-derived from the key's JWT `sub` (`TEEMILL_PROJECT` env var only as an override) |
| `PRODIGI_API_KEY` | live (non-`test_`) key | |
| `PRODIGI_API_BASE_URL` | **UNSET** | the app defaults to the live endpoint; this var exists only to point dev/preview at the sandbox. Setting it in prod is the classic footgun |
| `PRINTIFY_API_KEY` | live Personal Access Token (Bearer) | Printify has **no sandbox** — this is the real account. Required only once a Printify-backed product type is live (Epic MFTF-17) |
| `PRINTIFY_SHOP_ID` | prod shop id (`GET /v1/shops.json`) | pins the shop; orders/webhooks are shop-scoped |
| `PRINTIFY_WEBHOOK_SECRET` | webhook signing secret | HMAC-SHA256 over the raw body; register the webhook at `https://<prod domain>/api/webhooks/printify`. Status detection ships on polling until the live signature header + payloads are confirmed (US-MFTF-17.3) |
| `MAILERSEND_API_KEY` | live key | confirm the MailerSend account is off trial limits (the unique-recipient cap, see CHORE-14 #MS42225) before launch |
| `EMAIL_FROM` | `noreply@<verified sending domain>` | domain must be verified in MailerSend |
| `DROPSHIPPING_CONTACT_EMAIL` | a real, monitored address on a domain you own | Teemill forwards this as the order contact — it must be deliverable |
| `BLOB_READ_WRITE_TOKEN` | prod Blob store token | |
| `CRON_SECRET` | fresh `openssl rand -hex 32` | authenticates the five vercel.json cron routes |
| `PLATFORM_FEE_PERCENT` | e.g. `10` | |

### Optional / default-off

| Variable | Launch stance |
|---|---|
| `STRIPE_TAX_ENABLED` | Leave **unset/false** until Stripe Dashboard tax registrations + origin address are configured, then set `true` (Epic 5 gate — see docs/tax-configuration.md) |
| `BLOB_PUBLIC_READ_WRITE_TOKEN` | Only if a separate public Blob store is used (falls back to `BLOB_READ_WRITE_TOKEN`) |
| `DROPSHIPPING_CONTACT_PHONE` | Optional order contact phone |
| `AUCTION_PAYMENT_WINDOW_HOURS` | Default 48 |
| `DROPSHIPPING_DEBUG` | **Never in prod** — logs raw provider payloads |
| `TEEMILL_API_BASE_URL`, `TEEMILL_SITE_URL`, `TEEMILL_PROJECT`, `TEEMILL_CONTACT_*` | Defaults are correct; overrides only |
| `PRINTIFY_API_BASE_URL` | Default (`https://api.printify.com/v1`) is correct; override only |
| `PRINTFUL_API_KEY`, `PRINTFUL_WEBHOOK_SECRET`, `PRINTFUL_STORE_ID`, `PRINTFUL_API_BASE_URL` | **Not launch-required** — Printful (Epic MFTF-18) is in discovery. Promote to the required table once the integration ships. See docs/printful-api-notes.md |

Dead vars removed from `.env.local.example`: `TAXJAR_API_KEY`/Avalara (TaxJar scaffolding
deleted in Epic 5), `STRIPE_CONNECT_CLIENT_ID` (single-seller, no Connect),
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (auth is credentials-only; no OAuth provider is
registered in `src/auth.ts`).

### Post-rotation smoke tests (per the AC)

- **Stripe:** place a real low-value checkout on prod, confirm the webhook fires
  (Order row created, confirmation email received), then refund from the dashboard.
- **Teemill:** `GET https://api.teemill.com/v1/catalog/products?project=<sub>` with the
  live key → 200 with your products.
- **Prodigi:** `GET https://api.prodigi.com/v4.0/products/GLOBAL-FAP-16X24` with the live
  key → 200.
- **MailerSend:** trigger a password-reset email on prod, confirm delivery.

---

## First-live-order verification checklist (fold into US-MFTF-10.6 sample orders)

The sample order (10.6) is also the long-awaited live-confirmation run for every
`// PENDING LIVE CONFIRMATION` gate in the tracker/docs. When the founders place the
first real orders, verify and then update the corresponding notes:

- **Teemill (US-MFTF-12.5/12.6, BUG-13):** the quote `POST /orders` and paid
  `POST /orders/{id}/confirm` accept a 0-warehouse-stock print-on-demand variant via the
  catalog `variantRef` (vs. needing `gfnVariantRef`); real order-status words from
  polling `GET /orders/{ref}`; whether an unconfirmed `POST /orders` expires or bills.
- **Prodigi (US-MFTF-14.1):** first live webhook callback — confirm event `type` names
  and the `data.order.…` field paths; designed-apparel order end-to-end with the design
  asset on `printArea: "front"`.
- **Epic MFTF-PF:** canvas wrap (`MirrorWrap`) and `sizing: "fitPrintArea"` on a real
  paid canvas order; whether Prodigi auto-rotates a rotated framing crop.
- **Prodigi quotes:** omitting `shippingMethod` returns all service tiers on a live
  multi-tier quote.

---

## Launch-adjacent Infrastructure chores (flag, separate decisions)

- **CHORE-1 (Vercel Pro):** all five crons are daily (Hobby-compatible), which means
  auctions close and payment deadlines are enforced up to ~24 h late, and the 24-h
  payment reminder can't fire on time. Fine if auctions stay dormant at launch;
  needs Pro + sub-daily schedules if any auction goes live.
- **CHORE-2 (DNS):** production domain must exist before 10.2 (three env vars above
  embed it) — decide the domain first.
- **CHORE-4:** superseded by US-MFTF-10.2 (mark it when 10.2 completes).

---

## US-MFTF-10.8 — The go-live code change (GATED: founder go-ahead required)

The under-construction gate (CHORE-15) is a single line. `/shop`, `/discover`,
`/browse` etc. are already publicly reachable — only `/` redirects logged-out visitors:

```tsx
// src/app/page.tsx (current)
export default async function HomePage() {
  const session = await auth();
  const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (roles.includes("ADMIN")) redirect("/dashboard/admin");
  if (roles.includes("SELLER")) redirect("/dashboard/seller");
  if (roles.includes("BUYER")) redirect("/dashboard/buyer");
  redirect("/coming-soon");   // ← the gate: change this line to go live
}
```

**Do not apply until both founders sign off and every other 10.x story is done.**
Two options for the final line (founder/spec decision — recommend deciding in a
tdd-spec-session before executing):

1. `redirect("/discover")` — one-line change; the Discover bento becomes the effective
   public homepage via a redirect.
2. Render the Discover page at `/` directly (move/compose `DiscoverBento` into
   `page.tsx` for logged-out visitors) — better for SEO (no redirect hop, `/` gets the
   content), slightly more code.

Cleanup in the same change: delete `src/app/coming-soon/page.tsx` (or keep it reachable
but unlinked, for reuse during maintenance windows).

Final AC: production smoke test browse → product detail → checkout → order confirmation
after the change deploys.
