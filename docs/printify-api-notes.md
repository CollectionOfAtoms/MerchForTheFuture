# Printify API Discovery Notes (v1)

**Status:** Discovery spike (Epic MFTF-17, US-MFTF-17.1). **Live-verified 2026-07-12** against a
real `PRINTIFY_API_KEY` using the read-only probe `scripts/probe-printify-catalog.ts` (catalog +
shipping-cost calculation only — **no order created, nothing fulfilled**; Printify has no
sandbox, same as Teemill). Items that need a real placed order (order-response shape, live status
transitions, webhook payloads, signature header) are marked `// UNVERIFIED` and are deferred to
**US-MFTF-17.3** (founder live order) by design — we do not fulfill a test order at spike time.

> Companion to `docs/prodigi-api-notes.md`, `docs/teemill-api-notes.md`, and
> `docs/printful-api-notes.md`. Printify is a **print-on-demand marketplace/aggregator** (many
> print providers behind one catalog), integrated as a **DESIGNED** provider (upload a design
> onto a chosen blueprint variant, like Prodigi/Printful — NOT a referenced-product model like
> Teemill). Must pass the **material-standard gate** — see the Material-Standard note (gate
> cleared 2026-07-11 by manual founder curation; Printify exposes no structured composition to
> automate it).

---

## Recommendation: **DESIGNED** (resolves the US-MFTF-17.1 central question)

Product creation is **upload-a-design-onto-a-blank**: you `POST` a product to your own shop with
a `blueprint_id` + `print_provider_id` + selected `variants` + `print_areas` (artwork uploaded
via `/uploads/images.json`). There is **no** "reference an externally-built product by ID/URL"
pull model — products live in *your* Printify shop once created. This is the Prodigi/Printful
shape, so US-MFTF-17.2 should follow the **MFTF-4/5 designed pattern** (founder-curated blueprints
+ admin-defined colours, seller selects a subset, design file submitted at order time), **not**
the MFTF-13 referenced pattern.

**One structural difference from every existing provider:** a blueprint is offered by *many*
print providers (blueprint 5 "Unisex Cotton Crew Tee" had **9**: Duplium, Underground Threads,
Printify Choice, Dimona Tee, Monster Digital, …), each with its **own** variant set, pricing,
shipping profile, and print quality. The curated catalog must pin a specific
**`(blueprint_id, print_provider_id)`** pair — this is the primary schema/curation implication
for US-MFTF-17.2.

---

## Summary (live-verified 2026-07-12)

- **Base URL:** `https://api.printify.com/v1` (no env override needed; add `PRINTIFY_API_BASE_URL`
  only if we ever want one). All endpoints under `/v1`.
- **Auth:** `Authorization: Bearer {PRINTIFY_API_KEY}` (Personal Access Token). ✓ verified — a
  bare Bearer token authorized every catalog + shop call; no extra store-scoping header needed.
  A **`User-Agent`** header is sent by the client (Printify requests one).
- **Shop scoping:** account → **shops**. `GET /shops.json` → our token has **1 shop**
  `28204676` ("My new store", `sales_channel: "disconnected"`). "Disconnected" = a Manual/API
  store not tied to an external channel (Etsy/Shopify) — orders are driven entirely via the API,
  which is exactly our model. Order/product/webhook endpoints are **shop-scoped**
  (`/shops/{shop_id}/…`). This is Printify's analog of Teemill's `project` claim.
- **Currency:** **USD**, amounts as **integer cents** (shipping `first_item.cost: 1449` = $14.49;
  calc `{ "standard": 1959 }` = $19.59). ✓ Fits the existing "fixed USD retail, provider cost
  cached for margin-monitoring, no live FX at checkout" model (like Prodigi; unlike Teemill GBP).
- **Sourcing mode:** **DESIGNED** (see Recommendation).

---

## Rate limits (verified)

Global **600 requests / minute**, surfaced on responses via `X-RateLimit-Limit` /
`X-RateLimit-Remaining` (observed `600` / `599` on `GET /shops.json`). Over-limit → **429**
(honour `Retry-After`). Printify additionally documents tighter limits on some write endpoints
(catalog ~100/min; product publish ~200/30min) — // UNVERIFIED exact per-endpoint sub-limits, but
the global 600/min headers are confirmed, so catalog sync can be budgeted from
`X-RateLimit-Remaining` in `printify/client.ts`.

---

## Catalog — blueprints → print providers → variants

`GET /catalog/blueprints.json` returned **1690** blueprints. Shape:

| Endpoint | Purpose | Verified shape |
|---|---|---|
| `GET /catalog/blueprints.json` | All blueprints (product types) | `[{ id, title, description, brand, model, images }]` |
| `GET /catalog/blueprints/{id}.json` | One blueprint | same keys; `description` is marketing **HTML**, `brand`+`model` identify the blank (e.g. Next Level 3600) |
| `GET /catalog/blueprints/{id}/print_providers.json` | Providers offering it | `[{ id, title }]` — **many per blueprint** (9 for id 5) |
| `GET /catalog/blueprints/{id}/print_providers/{pid}/variants.json` | Orderable variants | `{ variants: [{ id, title, options, placeholders, decoration_methods }] }` |
| `GET /catalog/blueprints/{id}/print_providers/{pid}/shipping.json` | Shipping profile | `{ handling_time, profiles: [{ variant_ids, first_item, additional_items, countries }] }` |

**Variant shape** (blueprint 5 / provider 41, verified):
```json
{
  "id": 17391,
  "title": "Heather Grey / S",
  "options": { "color": "Heather Grey", "size": "S" },
  "placeholders": [
    { "position": "front", "decoration_method": "dtg", "width": 2419, "height": 2761 },
    { "position": "back",  "decoration_method": "dtg", "width": 2419, "height": 2761 }
  ],
  "decoration_methods": ["dtg"]
}
```
- `id` (int) is the **orderable variant id** used in orders/shipping.
- `options.color` / `options.size` are **names only** — **no hex** is returned here. Consistent
  with DESIGNED mode: admin defines colours (and their hex) per product type in our own catalog
  (MFTF-5 pattern), rather than trusting a provider hex. // UNVERIFIED whether hex is available
  on any other endpoint — treat as name-only.
- `placeholders` give the **print-area pixel dimensions** per position/decoration — this is what
  the design-file submission targets (front/back DTG, 2419×2761 for this variant).
- **Stock semantics (BUG-13 lesson) — CORRECTED 2026-08-15:** the earlier spike claim ("no
  per-variant stock; don't model it") was drawn from the DEFAULT `variants.json`, which
  **silently hides out-of-stock variants**. Passing **`?show-out-of-stock=1`** returns the full
  set, so availability **is** per-variant after all (this was Open Q#8). Verified live: blueprint
  1580 (Women's Baby Tee) / provider 99 returns **4** variants by default (Light Pink, Sand × L,
  XL) vs **16** with the flag (Black, Light Pink, Sand, White × S, M, L, XL). The variant object
  itself still carries no availability field — a variant is "orderable now" iff it appears in the
  DEFAULT (no-flag) list. **Consequence:** catalog sync must use `?show-out-of-stock=1` to cache
  the complete, stable colour/size range (US-MFTF-17.2 fix), and live orderability is detected by
  diffing against the default list on the product page + at checkout (US-MFTF-17.4), mirroring the
  Teemill `isOrderable` re-check. See `scripts/printify-blueprint-lookup.ts`.

---

## Material-Standard note (the gate — critical)

**Printify exposes NO structured fabric composition.** The blueprint object has only
`description` (marketing HTML, e.g. "Soft, lightweight cotton…"), `brand`, and `model` — no
`%`-composition field. So, unlike Printful (structured composition → automatable parser guard),
Printify's material-standard gate is **manual founder curation only**: the founder identifies the
qualifying blueprint+provider styles by hand (done 2026-07-11 — "specific styles identified").

- **Consequence for US-MFTF-17.2:** the curated catalog is an explicit allow-list of
  `(blueprint_id, print_provider_id)` (+ chosen variant ids); there is **no** BUG-16-style
  auto-reject guard available for Printify. Document each curated style's material rationale
  out-of-band (the founder's screen is authoritative — ink/dye/certification aren't in the API).
- The `brand`/`model` fields *can* be used to look a blank up against a known-good list, but the
  API cannot confirm composition, so it can only assist, never decide.

---

## Orders — create → **send-to-production** (the safety valve)  // partially live 2026-08-15

> **LIVE FINDING (2026-08-15):** a real checkout order-create surfaced the correct DESIGNED
> line-item shape. **`print_areas` on the ORDER endpoint is an OBJECT keyed by print position**
> (`front`/`back`), whose value is the **design URL** (Printify fetches + auto-centres it):
> `line_items[].print_areas = { "front": "https://…/design.png" }`. The product-creation shape we
> first shipped — `[{ variant_ids, placeholders:[{ position, images:[{ id,x,y,scale,angle }] }] }]` —
> is **WRONG for orders** and 400s `code 8150 "The src/x/y/scale/angle field is required"`. A
> positioned form also exists (`{ front: [{ src, x, y, scale, angle }] }`) — that's what a future
> placement tool (US-MFTF-17.7) would emit. Fixed in `printify.ts:createProviderOrder`. Still
> // UNVERIFIED: whether `src`/the URL form is preferred over an uploaded-image id, and the
> create-order **response** shape — a real order that reaches production (US-MFTF-17.3) confirms both.

**Not fully exercised in the spike** (no sandbox). Documented from the API + confirmed-safe design:

1. **`POST /shops/{shop_id}/orders.json`** creates an order. On a Manual/API ("disconnected")
   shop, a created order is **not automatically produced** — it must be explicitly pushed.
2. **`POST /shops/{shop_id}/orders/{order_id}/send-to-production.json`** starts fulfilment.
   *This two-step is the safety valve:* the integration can create + inspect an order without
   fulfilling, and only `send-to-production` commits it. // UNVERIFIED the exact create-order
   response shape, required line-item fields for a DESIGNED order (blueprint_id + print_provider_id
   + variant_id + print_areas with uploaded image ids), and whether any shop setting can
   auto-produce — **confirm carefully at 17.3 before the first real order**.
3. Design files: upload art via **`POST /uploads/images.json`** (returns an image id referenced
   in the product/order `print_areas`). Submitted with no watermark, per the existing Prodigi/
   MFTF-5 design-file path.

### Shipping (verified — creates no order)
- **`POST /shops/{shop_id}/orders/shipping.json`** computes shipping for line items + `address_to`
  **without** creating an order. ✓ verified: returned `{ "standard": 1959 }` (USD cents). Maps
  into our `ShippingQuote` (`shippingMethod`, `shippingCost`, `currency: USD`). Method keys seen:
  `standard` (express/priority may appear per provider/route — // UNVERIFIED full method set).
- The static `…/shipping.json` **profile** (verified) gives `first_item`/`additional_items` cost +
  `countries[]` + `handling_time` (`{ value: 10, unit: "day" }`) for margin pre-computation.

---

## Fulfillment status — webhooks vs polling  // UNVERIFIED payloads

- **Webhook config verified reachable:** `GET /shops/{shop_id}/webhooks.json` → `200 []` (none
  configured). Create via `POST /shops/{shop_id}/webhooks.json` (topic + URL).
- **Documented events** (payloads NOT verified — need a real order at 17.3):
  `order:created`, `order:updated`, `order:sent-to-production`, `order:shipment:created`,
  `order:shipment:delivered`. Map → canonical `PROCESSING | PRINTING | SHIPPED | DELIVERED |
  CANCELLED | ERROR`.
  - // UNVERIFIED whether a distinct **production/printing** event exists to fire our `PRINTING`
    email, or whether it must be inferred from `order:sent-to-production`. Until confirmed,
    PRINTING may be derived from `sent-to-production`.
  - // UNVERIFIED the **webhook signature** mechanism (header name + algorithm). Printify signs
    with an HMAC-SHA256 over the raw body using the shop's secret — **do not assume** the header
    name; capture it on the first live webhook and verify constant-time in
    `src/app/api/webhooks/printify/route.ts`, storing the secret in `PRINTIFY_WEBHOOK_SECRET`.
- **Default to polling** per the Teemill/`checkFulfillmentStatus()` precedent until webhooks are
  live-confirmed. Status read for polling: `GET /shops/{shop_id}/orders/{order_id}.json` →
  order `status`. // UNVERIFIED exact status vocabulary + shipment/tracking field paths.

---

## Mockups  // UNVERIFIED

Printify **generates** mockup images, but they are produced when a **product** is created/
published in a shop, exposed on the product's `images[]` (each with `src`, `variant_ids`,
`position`, `is_default`). Since DESIGNED mode uses our own lifestyle-photo pipeline for buyer
imagery, provider mockups are **optional** (nice-to-have for a design preview at listing setup).
Not verified — no product exists yet (`GET /shops/{id}/products.json` → 0). Revisit only if we
want provider-generated previews in the seller flow.

---

## Sandbox / test mode

**None** (same as Teemill). ⇒ automated tests use **MSW** (no live calls); live verification uses
the real key against the real shop, and the **only** safe pre-17.3 operations are catalog reads +
the shipping **calculation** endpoint (both used by this spike). Order creation/production is
deferred to the founder live order (17.3).

---

## Planned integration (where the code will live) — New-Provider Pattern (DESIGNED)

Not yet built; target shape (subclass + factory + client + status map + webhook + catalog sync +
MSW + docs), following the New-Provider Pattern in `project_description.md`:

- `src/lib/fulfillment/providers/printify.ts` — `PrintifyFulfillmentProvider extends
  FulfillmentProvider`; `createProviderOrder` (`POST /orders.json`) + explicit
  `send-to-production`; `quoteShipping` (`POST /orders/shipping.json`); `checkFulfillmentStatus`
  (`GET /orders/{id}.json`, polling backstop); `mapPrintifyStatusToCanonical`.
- `src/lib/fulfillment/printify/client.ts` — base URL, Bearer, `User-Agent`, shop id, rate-limit-
  aware (`X-RateLimit-Remaining`).
- `src/lib/fulfillment/index.ts` — `getProviderByKey()` gains `case 'printify'`.
- `src/lib/apparel/sync-printify.ts` — DESIGNED-mode catalog sync scoped to the curated
  `(blueprint_id, print_provider_id, variant_ids)` allow-list (à la `sync-prodigi.ts`); maps
  colour **names** to admin-defined hex (MFTF-5), reads `placeholders` for print-area dims.
- `src/app/api/webhooks/printify/route.ts` — signed webhook → shared `applyFulfillmentTransition`
  seam (same seam Prodigi/Teemill feed).
- `prisma/schema.prisma` — `PRINTIFY` added to `enum FulfillmentProviderType`; Printify identity
  as nullable `ProductType` columns: **`printifyBlueprintId` + `printifyPrintProviderId`**
  (+ per-variant Printify `variantId`) — do NOT overload `providerSkuBase` (the provider pair is
  two ids, not one SKU).
- `__tests__/mocks/handlers.ts` — `printifyHandlers` (shops, catalog blueprints/providers/
  variants/shipping, `orders/shipping` calc, order create + send-to-production, order status,
  signed webhook fixture). No live Printify calls in tests.

---

## Key differences vs Prodigi / Teemill / Printful

| Concern | **Printify (v1)** | Prodigi | Teemill | Printful (v2) |
|---|---|---|---|---|
| Model | DESIGNED (upload onto catalog variant) | DESIGNED (blank) | REFERENCED (product ref) | DESIGNED (upload onto variant) |
| Provider type | **PoD marketplace — many providers per blueprint** | Single | Single | Single vertically-integrated |
| Curation unit | **`(blueprint_id, print_provider_id)` pair** | SKU | product ref | catalog variant |
| Order flow | create → **send-to-production** (explicit) | single-step | two-step (sync) | two-step draft→confirm, async cost |
| Currency | **USD** (cents) | USD | GBP only | Requestable → USD |
| Rate limits | **600/min, headers** | n/a | undocumented | 120/60s, headers |
| Shipment status | webhooks (topics) + order poll | webhook (unsigned token) | polling only | signed webhooks |
| Material data | **none exposed (manual curation)** | `paperType` | GOTS (all organic) | fabric composition exposed |
| Stock | **POD, no stock field** | n/a | warehouse (BUG-13) | POD |
| Sandbox | **none** (real shop, calc-only pre-order) | yes | none | none (test store) |

---

## Open / `// UNVERIFIED` items (resolve at US-MFTF-17.3 — needs a real order)

| # | Question | Status |
|---|---|---|
| 1 | Create-order response shape + required DESIGNED line-item fields (print_areas/image ids) | UNVERIFIED — needs a real order |
| 2 | Does any shop setting auto-produce, or is `send-to-production` always required? | UNVERIFIED — **confirm before first live order** |
| 3 | Webhook **signature** header name + algorithm | UNVERIFIED — capture on first live webhook |
| 4 | Live order/shipment **status vocabulary** + tracking number/carrier field paths | UNVERIFIED |
| 5 | Distinct **PRINTING/production** event, or infer from `sent-to-production`? | UNVERIFIED |
| 6 | Colour **hex** availability (variants give names only) | UNVERIFIED — treat as name-only; use admin hex |
| 7 | Per-endpoint sub-rate-limits (catalog / publish) | UNVERIFIED — global 600/min confirmed |
| 8 | Provider-level availability/enabled flag to gate exposure | UNVERIFIED — check print-provider detail |
| 9 | Full shipping method set (beyond `standard`) per provider/route | UNVERIFIED |

---

## Env vars

`PRINTIFY_API_KEY` (Bearer PAT — **set, verified 2026-07-12**), `PRINTIFY_WEBHOOK_SECRET`
(signature verification — for 17.2/17.3), `PRINTIFY_SHOP_ID` (recommended: pin the shop id
`28204676` rather than re-fetching every call), optional `PRINTIFY_API_BASE_URL` (default
`https://api.printify.com/v1`). Add to `.env.local.example` + the production inventory in
`docs/pre-launch-runbook.md` when 17.2 lands.

## Sources

- [Printify API docs](https://developers.printify.com/) (v1).
- Live probe `scripts/probe-printify-catalog.ts`, run 2026-07-12 against the founder's key
  (shop `28204676`): catalog + shipping-calc shapes captured directly; order/webhook/status
  shapes documented from the docs and left UNVERIFIED pending US-MFTF-17.3.
