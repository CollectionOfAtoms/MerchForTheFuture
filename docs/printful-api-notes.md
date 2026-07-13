# Printful API Discovery Notes (v2)

**Status:** Discovery spike (Epic MFTF-18). Compiled from the public Printful v2 docs
(`developers.printful.com/docs/v2-beta`) — **not yet live-verified** (no `PRINTFUL_API_KEY`
present in `.env.local` at time of writing). Everything marked `// UNVERIFIED` needs a run
against a real key + Printful **test store** before the dependent story can pass. This mirrors
the Teemill onboarding (CHORE-17 spike → notes → live verification → implementation).
**Last updated:** 2026-07-11

> Companion to `docs/prodigi-api-notes.md` and `docs/teemill-api-notes.md`. Printful is a
> candidate **third apparel dropshipper** (Epic MFTF-18, previously deferred). It is a **single
> vertically-integrated provider** (not a marketplace like Printify/MFTF-17), so its integration
> shape is closest to Teemill (two-step order) + Prodigi (designed-mode: upload a design onto a
> catalog variant). It must pass the **material-standard gate** before being scheduled — see the
> Material-Standard note.

---

## Summary for MFTF-18

- **Base URL:** `https://api.printful.com/v2/` (env `PRINTFUL_API_BASE_URL`, default this).
  Use **v2** endpoints (founder directive; v1 is legacy). Some capabilities may still only exist
  on v1 — fall back per-endpoint only where v2 has no equivalent, and note it here.
- **Auth:** `Authorization: Bearer {PRINTFUL_API_KEY}` (a store/account private token; OAuth also
  available but the token is the server-to-server path). // UNVERIFIED whether an account-level
  token additionally needs an `X-PF-Store-Id` header on v2 — **confirm on the first live call**;
  if so, add `PRINTFUL_STORE_ID`.
- **Currency:** requestable on the shipping/estimate calls — request **USD** so (like Prodigi,
  unlike Teemill's GBP) no FX conversion is needed for the buyer total. // UNVERIFIED exact
  currency param name/placement.
- **DESIGNED-mode provider:** the seller/founder uploads a design onto a chosen Printful catalog
  variant (like Prodigi's blank model), NOT a referenced-product-ref model (Teemill).

---

## Rate limits (documented)

Leaky-bucket **120 requests / 60 s**, surfaced on every response via headers:
`X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset`, `X-Ratelimit-Policy`
(policy string e.g. `"120;w=60;"`). Over-limit → **429**. Unlike Teemill (undocumented limits),
this is known — so checkout-time catalog reads can be budgeted. The client (`printful/client.ts`)
should read `X-Ratelimit-Remaining` and back off before 429 on bursty catalog syncs.

---

## Catalog v2 — `GET /v2/catalog-products` and friends

| Endpoint | Purpose |
|---|---|
| `GET /v2/catalog-products` | List products; filter `colors,placements,techniques,category_ids,types`; sort; paginate (`limit/offset/total`) |
| `GET /v2/catalog-products/{id}` | One product (fabric/material in the description, weight) |
| `GET /v2/catalog-products/{id}/catalog-variants` | Variants for a product |
| `GET /v2/catalog-variants/{id}` | One variant |
| `GET /v2/catalog-variants/{id}/prices` | Prices by technique/placement/quantity |
| `GET /v2/catalog-products/{id}/availability` | Stock/availability by region + technique |
| `GET /v2/catalog-products/{id}/mockup-styles` | Mockup styles by placement (drives mockup tasks) |
| `GET /v2/catalog-products/{id}/sizes` | Size guides |
| `GET /v2/catalog-products/{id}/images` / `catalog-variants/{id}/images` | Blank + variant images |

- Responses use ISO-8601 UTC timestamps, **prices as decimal strings** (`"28.95"`), uniform
  `limit/offset/total` pagination, and HATEOAS `_links`.
- **Default Selling Region (DSR)** filter constrains results to shippable regions
  (`worldwide`, `north_america`, `europe`, `uk`, …) — set to the US region for our catalog.
- // UNVERIFIED exact field paths for: variant `id` used in orders (`catalog_variant_id`),
  colour name/hex, size label, per-variant image, and the fabric-composition string location
  (it appears in the **product description/материals** text, not a structured enum — see below).

---

## Material-Standard note (the gate — critical)

Printful **exposes fabric composition** in the catalog (product descriptions carry strings like
`"52% airlume combed ring-spun cotton, 48% poly fleece"` plus weight). This is a real advantage
over Printify (which exposes none). Consequence for the brand's **non-negotiable material
standard** (sustainably sourced AND biodegradable; natural fibres only; all-biodegradable
natural-fibre blends OK; no synthetics/synthetic blends; bamboo viscose case-by-case):

- A **composition parser** can act as an automatic guardrail at product-type creation — reject a
  blueprint whose parsed fabric contains polyester/elastane/etc., accept 100% organic cotton /
  hemp / linen, and **flag blends for founder judgment**. This is analogous to BUG-16's
  `validateProdigiSku()` guard: verify before persisting a `ProductType`.
- The parser is a **guardrail, not the decision** — the founder's material-standard screen is
  still authoritative (ink chemistry, dye, certification nuance aren't in the fabric string).
  Printful DOES carry GOTS-organic lines (Stanley/Stella etc.), so compliant products exist.
- // UNVERIFIED the exact response field the composition lives in and its consistency across
  blueprints — confirm on live catalog reads before trusting the parser.

---

## Orders v2 — two-step **draft → confirm** (async cost)

1. **`POST /v2/orders`** creates a **draft** (not charged, fulfilment does NOT start). Body:
   recipient `address_to` + `order_items[]`. Item shape (designed apparel):
   ```json
   {
     "quantity": 1,
     "catalog_variant_id": 9224,
     "source": "catalog",
     "placements": [
       { "placement": "front", "technique": "dtg",
         "layers": [{ "type": "file", "url": "https://…/design.png", "layer_options": [] }] }
     ]
   }
   ```
   Draft items are patch/delete-able (`/v2/orders/{id}/order-items/...`).
2. **Cost is ASYNC.** The order carries `calculation_status` ∈
   `pending | calculating | completed | failed`, with cost fields (`subtotal, shipping,
   digitization, additional_fee, fulfillment_fee, tax, vat, total`, all decimal strings). An
   order **cannot be confirmed while calculating**.
3. **`POST /v2/orders/{id}/confirm`** initiates fulfilment (only once cost `completed`).

**Order states:** `draft | confirmed | failed | canceled`.

> **Integration impact — the async wrinkle.** Our `FulfillmentProvider` seam is synchronous
> (`quoteShipping`, then `fulfill` = create → confirm). Printful requires a **poll-until-
> `completed`** loop on `calculation_status` between draft-create and confirm (bounded retries +
> timeout), which is new for this codebase (Prodigi/Teemill return costs synchronously). This is
> the main design consideration for the provider subclass and a likely story AC.

### Shipping rates (also async-capable)
- **`POST /v2/shipping-rates`** — recipient + `catalog_variant_id` + qty + currency → methods
  (`STANDARD`, …) with rate, min/max delivery days, customs-fee flag, departure country.
- **`POST /v2/order-estimation-tasks`** (+ `GET …?id={task}`) — bulk async estimate
  (`pending|completed|failed`), returns shipping + order costs. Use for multi-item accuracy.
- `quoteShipping()` maps these into our `ShippingQuote` (`shippingMethod`, `shippingCost`,
  `currency`, `options[]`). // UNVERIFIED which endpoint is authoritative for our single-shipment
  groups and whether it's sync or needs the task poll.

---

## Shipments & tracking — `GET /v2/shipments`

Returns per-shipment `status`, tracking URL, tracking events, estimated delivery (from/to),
departure country, and shipment items linked to order items. `checkFulfillmentStatus()` reads
this (polling backstop). // UNVERIFIED exact status vocabulary + tracking number/carrier field
paths (documented as "tracking URL + events" — confirm whether a bare number + carrier are
separate fields).

---

## Webhooks v2 (rich + signed)

Printful v2 has a broad, **per-event-configurable, signed** webhook system — a better fit than
Teemill (polling only) and cleaner than Prodigi (unsigned per-order token).

- **Config:** `GET/POST/DELETE /v2/webhooks` (set the endpoint URL; HTTPS enforced; subscription
  has an **expiration date** — must be refreshed); `GET/POST /v2/webhook-events` +
  `DELETE /v2/webhook-events/{event}` for per-event enable/disable.
- **Events we care about:**

  | Event | Canonical status | Notes |
  |---|---|---|
  | `order_created` | `PROCESSING` | draft acknowledged |
  | `order_updated` | (context) | cost recalced etc. |
  | `order_failed` | `ERROR` | |
  | `order_canceled` | `CANCELLED` | terminal |
  | `shipment_sent` | `SHIPPED` | carries tracking |
  | `shipment_delivered` | `DELIVERED` | |
  | `shipment_returned` / `shipment_out_of_stock` | `ERROR`/exception | admin retry queue |
  | `catalog_stock_updated` | — | ~5-min stock refresh (not order status) |
  | `mockup_task_finished` | — | async mockup ready |

  (There is no distinct "printing" event in the documented set; // UNVERIFIED whether a
  production/printing status exists to map to our `PRINTING` email — may come from `order_updated`
  or a shipment sub-status. Confirm live; until then PRINTING may not fire for Printful.)
- **Signing:** request signing is **supported** (verification headers included). // UNVERIFIED
  the **exact header name + algorithm** (Printify uses `X-Pfy-Signature: sha256=…` HMAC-SHA256;
  Printful's header name is **not confirmed here** — do NOT assume it matches). The route
  (`src/app/api/webhooks/printful/route.ts`) verifies with a **constant-time** compare against
  `PRINTFUL_WEBHOOK_SECRET`, then maps event → canonical status and hands to the shared
  `applyFulfillmentTransition` seam (same seam Prodigi/Teemill feed).

---

## Mockups (async) — `POST /v2/mockup-tasks`

Create an async mockup task (catalog product id + variant ids + mockup style ids + placements +
format) → `GET /v2/mockup-tasks?id={task}` (`pending|completed|failed`), completion also fired
via `mockup_task_finished`. Printful can **generate** buyer-facing mockups (closer to Teemill's
served mockups than Prodigi's "we upload lifestyle photos" model), but **asynchronously** — so a
listing's mockups may need a generate-then-poll/store step, or to be fetched at listing setup.
Design decision for the spec session: generate-at-setup vs. on-demand.

---

## Sandbox / test mode

**None documented** (v2 is beta). Printful suggests creating a **separate test store** for
safe testing. ⇒ automated tests use **MSW** (no live calls); live verification uses a real key
against a test store, exactly like Teemill. // UNVERIFIED whether a dedicated test/sandbox base
URL exists.

---

## Planned integration (where the code will live) — New-Provider Pattern

Not yet built; this is the target shape (subclass + factory + client + status map + webhook +
schema + MSW + docs), following `docs/*-api-notes.md` conventions and the New-Provider Pattern in
`project-description.md`:

- `src/lib/fulfillment/providers/printful.ts` — `PrintfulFulfillmentProvider` extends
  `FulfillmentProvider`; two-step `createProviderOrder` (draft) + `confirmProviderOrder`
  (`/confirm`) with the `calculation_status` poll; `quoteShipping` (shipping-rates/estimate);
  `checkFulfillmentStatus` (`GET /v2/shipments`); `mapPrintfulStatusToCanonical`.
- `src/lib/fulfillment/printful/client.ts` — base URL, Bearer, rate-limit-aware, store id.
- `src/lib/fulfillment/index.ts` — `getProviderByKey()` gains `case 'printful'`.
- `src/lib/apparel/…` — DESIGNED-mode catalog/attribute sync (à la `sync-prodigi.ts`) + the
  fabric-composition material-standard guard.
- `src/app/api/webhooks/printful/route.ts` — signed webhook → shared status seam.
- `prisma/schema.prisma` — `PRINTFUL` added to `enum FulfillmentProviderType`; Printful identity
  (`catalog_product_id` + variant ids) as nullable `ProductType` columns (recommended over
  overloading `providerSkuBase`).
- `__tests__/mocks/handlers.ts` — `printfulHandlers` (catalog, shipping-rates, order draft/
  confirm with async calc states, shipments, signed webhook).

---

## Key differences vs Prodigi / Teemill

| Concern | Printful (v2) | Prodigi | Teemill |
|---|---|---|---|
| Model | DESIGNED (upload onto catalog variant) | DESIGNED (blank) | REFERENCED (product ref) |
| Provider type | Single vertically-integrated | Single | Single |
| Order flow | **Two-step** draft → confirm, **async cost** | Single-step | Two-step (sync methods) |
| Currency | Requestable → USD | USD | GBP only |
| Rate limits | **120/60s, documented + headers** | n/a | undocumented |
| Shipment status | **Signed webhooks** (+ shipments GET) | webhook (unsigned token) | polling only |
| Mockups | **Async generated** (mockup-tasks) | we upload | served in catalog |
| Material data | **Fabric composition exposed** | `paperType` | GOTS (all organic) |
| Sandbox | none (test store) | yes | none |

---

## Open / `// UNVERIFIED` items (resolve on the live key + test store)

| # | Question | Status |
|---|---|---|
| 1 | Does an account token need `X-PF-Store-Id` on v2? | UNVERIFIED — confirm first call; add `PRINTFUL_STORE_ID` if so |
| 2 | Exact webhook signature **header name + algorithm** | UNVERIFIED — do not assume Printify's `X-Pfy-Signature` |
| 3 | Fabric-composition field path + cross-blueprint consistency | UNVERIFIED — gates the material parser |
| 4 | Is there a `PRINTING`/production status to fire our PRINTING email? | UNVERIFIED — may not exist; PRINTING may be skipped for Printful |
| 5 | Authoritative shipping endpoint for single-shipment groups (sync `shipping-rates` vs async `order-estimation-tasks`) | UNVERIFIED |
| 6 | `calculation_status` timing — how long until `completed`; poll budget within our 10s serverless limit | UNVERIFIED — impacts checkout-time confirm |
| 7 | Shipment tracking number + carrier field paths | UNVERIFIED |
| 8 | Currency request param name/placement | UNVERIFIED |
| 9 | Any capability only on v1 (fall-back needed) | UNVERIFIED |

---

## MSW stubs (planned)

Printful handlers will live in `__tests__/mocks/handlers.ts` (`printfulHandlers`, base
`https://api.printful.com/v2`): `GET /catalog-products` (+ `/{id}`, `/catalog-variants`),
`POST /shipping-rates`, `POST /orders` (draft, `calculation_status: "completed"` by default;
per-test override for `calculating`), `POST /orders/:id/confirm`, `GET /shipments`, and a signed
webhook fixture. No live Printful calls in tests. // shapes to be finalised against live responses.

## Env vars

`PRINTFUL_API_KEY` (Bearer token), `PRINTFUL_WEBHOOK_SECRET` (signature verification),
`PRINTFUL_STORE_ID` (if required — see UNVERIFIED #1), `PRINTFUL_API_BASE_URL`
(default `https://api.printful.com/v2`). Add to `.env.local.example` + the production inventory
in `docs/pre-launch-runbook.md`.

## Sources

- [Printful v2 API (beta) docs](https://developers.printful.com/docs/v2-beta/)
- [Printful developer portal](https://developers.printful.com/)
- Overview + catalog/order/webhook shapes captured 2026-07-11 from the v2 docs (pre-live).
