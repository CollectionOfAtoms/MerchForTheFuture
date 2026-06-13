# PROJECT.md — Merch for the Future

> Living document. Update this when architectural decisions change, new constraints are
> discovered, or design principles are refined. Commit changes alongside the relevant
> epic branch.

---

## Vision and Purpose

Merch for the Future is a direct-to-consumer apparel storefront selling optimism-forward,
sustainability-focused merchandise. Its mission is to create apparel that communicates
values toward our planet and its inhabitants — with humor, exclusively human-made art,
helpful information, and design choices that minimize harm — with the express intent of
building hopeful visions of the future.

The site exists as a custom-built alternative to platforms like Shopify because no
existing platform offered the combination of multi-dropshipper flexibility, low operating
cost at small scale, and freedom from per-transaction platform fees. It is built and
operated by its two founders.

**Brand voice:** Hopeful provocation. The aesthetic draws from solarpunk and sustainability
communities but is designed to reach the climate-anxious mainstream — people who wish we
were doing better and want that feeling reflected in what they wear, without needing to
already be radicalized into any particular movement. Some designs will be confrontational
in a way that is intended to disrupt fatalism rather than alienate.

**Product curation standard:** All apparel sold on this site must be 100% cotton. This is
a non-negotiable brand principle, not a preference. It reflects a meaningful difference in
environmental impact relative to conventional blended fabrics. Dropshipper relationships
are evaluated against this standard before integration.

---

## Users and Roles

**Buyer (public / authenticated)** — Anyone browsing or purchasing from the storefront.
Browsing is available without an account. Purchasing requires authentication. Buyers
receive transactional email (order confirmation, fulfillment updates).

**Seller** — Currently limited to the two founders. Sellers create and manage product
listings, including both drop-shipped items and physical originals. The seller role is
architecturally distinct from admin and is designed to support additional sellers in the
future if the business model expands, though there are no concrete plans for this.

**Admin** — Overlaps with seller for the founding team. Admins have access to fulfillment
actions, order management, and site configuration. For drop-shipped orders, fulfillment
is handled automatically via dropshipper API. For physical originals sold directly,
the admin is responsible for shipping and entering tracking information.

> The seller/admin distinction is meaningful and should be preserved. Do not collapse
> these roles even though they are currently held by the same people.

---

## Technology Rationale

| Dependency | Why chosen | Constraints it creates |
|---|---|---|
| Next.js (App Router) | Chosen for personal familiarity and fast Vercel setup; works well for SSR + server actions | App Router conventions differ significantly from Pages Router; read Next.js docs before writing routing or data-fetching code |
| Vercel | Fast deployment pipeline, native Next.js support, integrated Blob storage | Hobby plan: cron jobs limited to daily-or-slower schedules (sub-daily crons — e.g. auction closing — require Pro; see CHORE-1), 10s max serverless function timeout, limited concurrent builds |
| Neon PostgreSQL | Evaluated as a good fit for serverless/auction workloads; supports branching for test environments | Connection pooling required in serverless context; test suite uses a separate Neon branch (DATABASE_URL_TEST) |
| Prisma ORM | Selected by Claude Code as the idiomatic ORM for this stack | Generated client lives at src/generated/prisma — import from @/generated/prisma/client, not the default path. Use `prisma db push` not `prisma migrate dev` due to existing schema drift on Order.stripeSessionId |
| NextAuth.js | Chosen for convenience with Next.js; JWT sessions | Auth is mocked in tests via vi.mock() — do not use real sessions in test context |
| Prodigi | Inherited from Art & Sol codebase; chosen originally for open API (no Shopify dependency) and fine-art print quality | Product catalog limited to Prodigi's offerings; print quality for apparel is still being evaluated relative to alternatives |
| Teemill | Primary apparel dropshipper; GOTS-certified 100% organic cotton catalog | Integrated at the product catalog layer (MFTF-4): public catalog API used for admin product picker; Orders API (api.teemill.com/v1) is the fulfillment target for MFTF-7; no sandbox — use MSW for tests |
| Printify / Printful | Possible future apparel dropshippers | Not evaluated; would require cotton-standard verification before integration |
| MailerSend | Free tier available at current scale | Intercepted in tests via MSW at https://api.mailersend.com/v1/email — do not make real API calls in tests |
| Vercel Blob | Native integration with Vercel hosting | Used for image upload pipeline (three processed variants + watermark); requires BLOB_READ_WRITE_TOKEN |
| Stripe Checkout (embedded) | Standard for payments; embedded mode chosen for UX control | Checkout flow has specific UX constraints from embedded mode; Stripe Tax is configured |
| Tailwind v4 | In use at project start | No tailwind.config.ts — all tokens defined in src/app/globals.css inside @theme inline {}. Custom colors registered as --color-*, custom fonts as --font-* |

**Note on technology lock-in:** Several of these dependencies (Prisma, Neon, NextAuth.js)
were chosen pragmatically rather than as strong architectural opinions. If a future epic
surfaces a compelling reason to change one of them, that is a legitimate conversation.
The ones with the highest switching cost are Stripe (payment history), Vercel Blob
(stored images), and the Prisma schema (migration state).

---

## Design Principles

Axioms that should be treated as settled. New epics and stories must not contradict
these without an explicit decision to revise them here first.

- **100% cotton is non-negotiable.** No apparel product may be listed that does not meet
  this standard. This applies to all dropshippers, current and future.
- **Exclusively human-made art.** No AI-generated imagery on products. This is a brand
  commitment, not just a preference.
- **Dropshipper fulfillment is the primary model.** Physical originals sold directly are
  supported but are not the focus. The fulfillment path for drop-shipped items should be
  as automated as possible.
- **Seller and admin roles are architecturally distinct.** Do not merge them even though
  the same people currently hold both. The system should be capable of supporting
  additional sellers without a rewrite.
- **Cost discipline during pre-launch.** Features requiring paid plan upgrades should be
  flagged and deferred unless there is no reasonable workaround. This constraint applies
  until the site is generating revenue.
- **No Shopify dependency.** The entire reason this codebase exists is to avoid platform
  lock-in and per-transaction fees. Do not introduce dependencies that recreate that
  coupling.
- **Multi-dropshipper abstraction.** When a second dropshipper is integrated, the
  implementation should go behind a shared fulfillment interface rather than duplicating
  Prodigi-specific logic. Plan for this even before it is needed.

**Non-goals:**
- This is not a general-purpose marketplace. It is not designed for arbitrary third-party
  sellers to self-onboard without founder involvement.
- This is not an auction house. The auction feature is inherited infrastructure and may
  be used occasionally, but it is not the commercial focus and should not drive
  architectural decisions.
- This site does not sell synthetic or blended-fabric apparel.

---

## Open Questions and Deferred Decisions

| Question | Status | Notes |
|---|---|---|
| Should the storefront support a shopping cart? | Resolved | Scoped 2026-06-12 as Epic MFTF-11 (Cart) and Epic MFTF-12 (Multi-Provider Checkout & Fulfillment), replacing Epic MFTF-7. See the Cart & Checkout Model section. |
| Which dropshippers will be integrated beyond Prodigi? | Open | Printify, Printful, and T-Mill are candidates. T-Mill noted for strong sourcing standards. Integration depends on cotton standard verification and API evaluation. |
| Will Prodigi be retained for apparel, or only for fine-art prints? | Open | Prodigi's apparel print quality needs real-world evaluation before committing to it as the primary apparel vendor. |
| Multi-dropshipper fulfillment abstraction layer | Deferred | Required before a second dropshipper is integrated. Should be scoped as its own epic at that time. |
| Webhook support for physical-original shipment tracking | Deferred | Currently the admin manually enters tracking numbers. Webhook-based automation is desirable but not yet scoped. |
| Teemill per-product editor deep-link URL | Resolved | Confirmed live 2026-06-13 by the founder. The per-product editor is `https://teemill.com/create-a-product/{slug}/?project={projectId}` and the generic designer is `https://teemill.com/create-a-product/?project={projectId}`, where `projectId` is the JWT `sub` on the API key (derived via `getTeemillProject()`) and `slug` is captured from the catalog at ingest (`ApparelListing.providerProductSlug`). Implemented in `teemillEditUrl()`/`teemillDesignerUrl()`; the generic designer is the fallback when no slug is stored yet. |
| Will additional sellers ever be onboarded? | Deferred | The role architecture supports it, but there are no concrete plans. Revisit if business model expands. |
| Cart feature scope and UX | Resolved | Designed 2026-06-12. DB-backed guest-capable cart; apparel + prints; originals remain buy-now. Epics MFTF-11/MFTF-12. |
| Apparel retail pricing model | Resolved | Resolved 2026-06-12. Retail is a fixed USD price the seller sets, in both sourcing modes. For referenced (Teemill) listings the GBP base cost is cached (`providerBasePrice`) for margin monitoring only and never computes the sticker. The buyer pays USD; Teemill bills GBP at fulfillment; FX exposure sits between collected USD and owed GBP and is handled out-of-band (see FX/margin-monitoring row), never in the checkout total. |
| FX / margin monitoring for referenced (GBP-based) listings | Deferred | Teemill bases cost in GBP while the store prices in USD. No live FX is done at checkout. Post-launch, a founder-facing margin watch should flag listings whose USD retail has slipped below `providerBasePrice × current rate × target margin`. Manual eyeballing at launch (≤10 designs, two founders) is acceptable. Explicitly out of MFTF-12 scope. |
| Display/ingest of Prodigi's own mockups for designed listings | Deferred | The residual concern from the dissolved MFTF-8 mockup epic. Teemill serves mockups via its catalog (cached in MFTF-13.2); Prodigi has its own mockups. Whether to ingest and display Prodigi mockups for designed listings — and whether automatically or seller-curated (old US-MFTF-8.2 "accept/discard") — is unscoped. Designed-mode only. |
| Unified browse page (apparel + prints side by side) | Deferred | Conceivable as a catch-all browse page but not the intended primary buyer experience. Revisit after apparel browse (/shop) and fine-art browse (/browse) are both live. |
| T-Mill API integration details | Resolved (with residual live-confirm items) | CHORE-17 spike complete; API key 2026-06-10; catalog shape **live-verified 2026-06-12**. Orders API two-step flow confirmed (POST /orders → POST /orders/{id}/confirm). `/catalog/products` returns per-product variants with colours+hex, sizes, per-colour mockups (`images[].variantIds`), live per-warehouse stock, GBP prices, and orderable refs at `…/v1/catalog/variants/{uuid}`. Auth: raw key in `Authorization` (no Bearer), `project`=JWT `sub` claim (not public key). This drove the REFERENCED sourcing model (Epic MFTF-13). **Still needing live confirmation before dependent stories pass:** (a) parser validated against only one product; (b) Open Q#7 — `shippingMethodId` selection (standard vs buyer-facing); (c) rate limits (gates synchronous checkout-time stock/price re-reads); (d) webhook support/payload — until confirmed, shipment status is via polling `GET /orders/{ref}`. No sandbox — MSW required. See /docs/teemill-api-notes.md. |
| Per-color lifestyle photography | Deferred | Currently one set of lifestyle photos per listing covers all colorways. Per-color photos possible in future if QA sampling process scales. |
| Buyer reviews with photos | Deferred | Mentioned as a future direction. No scope yet. |
| Self-fulfillment provider (founders ship own products through the same pipeline) | Deferred | Nonzero chance of integrating the founders as a fulfillment provider one day. The FulfillmentProvider abstract base class (MFTF-12.1) and per-line-item order splitting are designed to make this a new subclass, not a rework. |
| Cart abandonment email | Deferred | Out of MVP cart scope (MFTF-11). Revisit post-launch. |

---

## Revision History

| Date | Change | Related epic |
|---|---|---|
| 2026-06-07 | Initial document created | — |
| 2026-06-07 | Added Apparel Product Model, Watermark Modes, Dropshipper Strategy sections; updated Open Questions with pricing model, unified browse, T-Mill API, per-color photos, buyer reviews | MFTF-3 through MFTF-9 |
| 2026-06-07 | Updated Dropshipper Strategy with T-Mill Orders API findings (MFTF-2 partial spike); updated T-Mill API open question status | MFTF-2 |
| 2026-06-12 | Updated Technology table: T-Mill row updated to reflect MFTF-4 catalog integration; Printify/Printful split into separate row. Updated Open Questions: T-Mill API status resolved (CHORE-17 complete, API key obtained). Noted Teemill webhook payload remains unconfirmed from live integration. | MFTF-4, CHORE-17 |
| 2026-06-12 | Live-verified Teemill catalog API drove a second apparel sourcing mode. Added Epic MFTF-13 (Referenced Apparel Listings). Apparel Product Model: introduced DESIGNED vs REFERENCED modes + normalized read-shape. Dropshipper Strategy: Teemill documented as REFERENCED source with verified auth; seller-opacity principle narrowed to designed-mode only (buyer-opacity unconditional); provider routing updated for `providerKey`. Resolved the apparel retail pricing question (fixed USD retail; GBP base cached for margin monitoring only; no checkout FX). Added deferred Open Questions: FX/margin monitoring, Prodigi-mockup display. MFTF-8 kept Deferred but rationale updated (moot for Teemill — mockups served via catalog). MFTF-12.3 extended for referenced stock/price re-read; MFTF-12.6 shipment-status changed to polling (webhooks unconfirmed); MFTF-12.1 gains `checkFulfillmentStatus()`. epicOrder: MFTF-13 inserted after MFTF-5, before MFTF-6. | MFTF-13, MFTF-6, MFTF-8, MFTF-12 |
---

## Apparel Product Model

_Added 2026-06-07. Documents decisions made during MFTF epic design session. **Updated 2026-06-12** to introduce two sourcing modes after live verification of the Teemill Orders API._

**Two sourcing modes.** An apparel listing is backed in one of two ways, recorded on `ApparelListing.sourcingMode`:

- **`DESIGNED`** (Prodigi today) — the seller uploads a clean design file onto a founder-curated blank from the platform catalog (MFTF-4), and the platform owns colour/size curation. This is the original model described below.
- **`REFERENCED`** (Teemill today) — the founder builds the product on Teemill's site, and the listing references the resulting Teemill product. Blank, design, colours (with hex), sizes, per-colour mockups, live stock, and GBP base price are all owned by the provider's catalog and ingested into a cached snapshot (`ReferencedVariant` rows) keyed off one product ref. There is no design-file upload, no curated blank, and no seller colour-curation step — Teemill's builder already fixes those (the free tier caps a design at 3 colours).

**One listing, normalized read-shape.** Both modes share a single `ApparelListing` (title, description, sellerId, retailPrice, status, lifestyle photos). The browse, product-page, cart, and checkout core read a uniform projection — offered colours, sizes, retail price, images — and never branch on `sourcingMode` or provider. Only the `FulfillmentProvider` subclass knows how to turn a line item back into a provider order. If checkout has to ask "is this Teemill?", the abstraction has leaked.

The decisions below describe the **`DESIGNED`** mode unless noted; the referenced mode overrides the catalog/curation parts.

**Founder-curated product catalog.** The platform maintains a small set of approved product types (e.g. "Unisex Tee", "Tote Bag"). Sellers see only these approved types when creating listings — they do not see dropshipper names, SKUs, or the full dropshipper catalog. The mapping from product type to dropshipper and SKU is an admin-level concern, invisible in the seller UI. _(Designed mode only. Referenced-mode listings bypass the MFTF-4 catalog entirely — they reference a provider product directly, so a `ProductType` is neither created nor consulted. `ProductType.fulfillmentProvider` is therefore effectively a designed-mode setting; see Dropshipper Strategy.)_

**Listing = design × product type.** The same design can appear on multiple product types, but each combination is a separate listing. A "Solar Punk Bee" graphic on a tee and the same graphic on a tote bag are two distinct listings, priced and managed independently. _(Referenced mode: the "listing" maps one-to-one to one Teemill product ref; multiplicity across product types is whatever the founder built on Teemill.)_

**Color variants are seller-curated.** Each product type has a set of available colors (defined by the admin in the platform catalog). When creating a listing, the seller selects which subset of those colors to offer. Buyers choose from the seller-curated subset at checkout. _(Referenced mode: colours are **not** seller-curated — they are exactly the colours on the Teemill product, ingested with hex into `ReferencedVariant`. Seller colour-curation does not apply.)_

**Retail price is a fixed USD value the seller sets — in both modes.** Size is not variant-priced; all sizes for a listing share one retail price. For referenced (Teemill) listings the provider's base cost is in GBP and is cached (`providerBasePrice`) for **margin monitoring only** — it never computes the buyer's sticker. The buyer pays USD, Stripe settles USD, and Teemill bills the founders GBP later at fulfillment, so no FX conversion occurs anywhere in the checkout total. (This resolves the former "apparel retail pricing model" open question; the residual FX/margin-watch automation is a deferred item — see Open Questions.)

**Size is not variant-priced.** All sizes for a given listing share one retail price. Size selection happens at checkout without affecting price. No per-size stock management at this stage.

**Lifestyle photography is per-listing, not per-color.** A listing has one set of lifestyle photos (from physical QA samples ordered by the founders) shared across all color variants. There are no color-specific photos. The seller upload pipeline processes lifestyle photos through the corner-watermark variant pipeline.

**Design files are clean.** The design image submitted to the dropshipper for printing carries no watermark. It is stored separately from lifestyle photos in Blob storage and is never exposed to buyers. _(Designed mode only. Referenced mode uploads no design file at all — Teemill owns and stores the design; we hold only the product ref and cached mockup URLs.)_

---

## Watermark Modes

_Added 2026-06-07._

The image variant pipeline (`src/lib/artworks/variants.ts`) supports two watermark styles:

| Mode | Used for | Behavior |
|---|---|---|
| `diagonal` | Fine-art originals and prints | Aggressive diagonal overlay across the full image; degrades at-home printability |
| `corner` | Apparel lifestyle photos | Small brand mark in bottom-right corner at ~8% image width, 70% opacity; grid and thumbnail variants are not watermarked |

Design files sent to dropshippers bypass watermarking entirely.

---

## Dropshipper Strategy

_Added 2026-06-07._

**T-Mill is the primary apparel dropshipper, integrated as a `REFERENCED` source.** Their entire catalog is GOTS-certified 100% organic cotton, satisfying the brand's non-negotiable fabric standard without case-by-case verification. As of live API verification (2026-06-12), Teemill listings reference a Teemill **product ref**: the founder builds the product on Teemill's site, and the platform ingests the catalog entry (colours+hex, sizes, per-colour mockups, live stock, GBP base price, orderable variant refs at `…/v1/catalog/variants/{uuid}`) into a cached snapshot. This is distinct from the Prodigi `DESIGNED` model (upload a design file onto a curated blank). See the Apparel Product Model section and Epic MFTF-13.

**Verified Teemill auth (pin this — it is non-obvious):** `Authorization: {TEEMILL_API_KEY}` with **no `Bearer` prefix**, and `?project={sub}` where `sub` is the JWT `sub` claim on the key (`merchforthefuture-451391` for this account) — **not** the public key, which returns 404. The legacy bearer-token format is accepted but must be avoided.

**T-Mill Orders API** (`https://api.teemill.com/v1`) is the fulfillment target — not the Custom Product API (`omnis/v3`), which creates Teemill-hosted storefront listings (would take the buyer off our site). Order submission is the two-step flow: `POST /orders` returns available shipping methods per fulfillment, then `POST /orders/{id}/confirm` selects a method and finalizes. No sandbox exists; MSW stubs are required for tests. **Webhooks are unconfirmed** — shipment status is detected by polling `GET /orders/{orderRef}` until webhook support and payload shape are verified live (see Open Questions and US-MFTF-12.6).

**Seller-opacity principle is mode-specific (refined 2026-06-12).** The original "sellers never see dropshipper names/SKUs" rule assumed a multi-seller world and a single sourcing model. It is **preserved for `DESIGNED` listings** (the seller picks "Unisex Tee", never a SKU) but **deliberately dropped for `REFERENCED` listings**, where it was already fictional — the founder logs into Teemill's builder, sees the product, and pastes its ref. The referenced-listing form names Teemill openly. The **buyer**-facing opacity ("Shipment 1 of 2", no provider names) is preserved unconditionally in both modes. This is a narrowing of an over-broad principle, not a reversal of the abstraction: buyer-facing and fulfillment-routing abstraction remain fully intact.

**Prodigi is retained for fine-art prints and as the apparel `DESIGNED` path.** Prodigi has some 100% cotton apparel options that have not been ruled out. The integration remains in place; apparel suitability pending real-world evaluation.

**All dropshippers sit behind a shared fulfillment abstraction layer** (`src/lib/fulfillment/`). As of MFTF-12, `FulfillmentProvider` is an **abstract base class** (not an interface): a shared `fulfill()` template method orchestrates the workflow, and every provider — current dropshippers and a possible future self-fulfillment provider — must implement the full set of abstract methods to compile. Adding a provider means subclassing and registering in the factory — no changes to order processing logic. Multi-item orders are split per provider: each cart line item is routed through its own provider's fulfillment pathway.

**Provider routing.** For designed listings the dropshipper is an admin-level configuration (`ProductType.fulfillmentProvider`), invisible to sellers and buyers. For referenced listings the provider is recorded directly on the listing (`ApparelListing.providerKey`, e.g. `"teemill"`). Checkout grouping resolves a single provider key per line item from whichever applies, then routes each shipment group through that provider's `fulfill()`. Buyers never see provider names in either case.

---

## Cart & Checkout Model

_Added 2026-06-12. Documents decisions made during the MFTF-11/MFTF-12 spec session. Replaces the single-item-per-checkout-session model (Epic MFTF-7, dropped)._

**Cart contents: apparel and prints only.** Physical originals remain direct buy-now — 1-of-1 items in a cart create reservation/concurrency problems for negligible UX gain. Auction wins are excluded; they keep their Epic 14 payment-deadline flow.

**Prints do not become listings.** Prints remain parameterized purchases off the artwork listing (dynamic Prodigi catalog filtered by aspect ratio, per US-15.3/15.4/15.6). Cart line items are polymorphic instead: a `CartItem` references a listing plus an `itemKind` (`APPAREL` | `PRINT`) and a structured `selection` payload, validated per kind. Adding a future item kind (e.g. self-fulfilled goods) is a new kind + validator + provider subclass, not a schema rework.

**DB-backed, guest-capable cart.** Guest carts are DB rows keyed by an anonymous token in an httpOnly cookie; on login or signup the guest cart merges into the user cart (union, quantities summed on identical selections). A daily cleanup cron removes guest carts inactive 30+ days — this cron must remain Hobby-compatible (daily-or-slower) and is unrelated to the sub-daily auction crons in CHORE-1.

**No holds, no reservations.** The cart is re-validated server-side at checkout creation: current price always wins, stale items are removed with human-readable reasons, and the buyer re-confirms before payment if anything changed. Print prices are re-quoted from Prodigi at checkout; cart display prices are snapshots only.

**One payment, split fulfillment.** A single embedded Stripe Checkout session (with Stripe Tax) covers the whole cart. One buyer-facing `Order` holds `OrderItem` rows and is split into per-provider `FulfillmentOrder` rows. After payment, each shipment group is dispatched through its provider's `fulfill()` independently — one shipment failing never blocks the others, and failures surface in the admin fulfillment queue with per-shipment retry. Buyers see "Shipment 1 of 2" with per-shipment tracking; dropshipper names are never exposed.

