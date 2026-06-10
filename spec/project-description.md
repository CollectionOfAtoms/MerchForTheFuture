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
| Vercel | Fast deployment pipeline, native Next.js support, integrated Blob storage | Hobby plan: no cron jobs, 10s max serverless function timeout, limited concurrent builds |
| Neon PostgreSQL | Evaluated as a good fit for serverless/auction workloads; supports branching for test environments | Connection pooling required in serverless context; test suite uses a separate Neon branch (DATABASE_URL_TEST) |
| Prisma ORM | Selected by Claude Code as the idiomatic ORM for this stack | Generated client lives at src/generated/prisma — import from @/generated/prisma/client, not the default path. Use `prisma db push` not `prisma migrate dev` due to existing schema drift on Order.stripeSessionId |
| NextAuth.js | Chosen for convenience with Next.js; JWT sessions | Auth is mocked in tests via vi.mock() — do not use real sessions in test context |
| Prodigi | Inherited from Art & Sol codebase; chosen originally for open API (no Shopify dependency) and fine-art print quality | Product catalog limited to Prodigi's offerings; print quality for apparel is still being evaluated relative to alternatives |
| Printify / Printful / T-Mill | Target future integrations for apparel, particularly 100% cotton options | Not yet integrated; fulfillment abstraction layer will be needed when a second dropshipper is added |
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
| Should the storefront support a shopping cart? | Open | Currently one item per checkout session. Multi-item checkout would significantly improve UX for buyers wanting multiple products. Needs scoping as an epic. |
| Which dropshippers will be integrated beyond Prodigi? | Open | Printify, Printful, and T-Mill are candidates. T-Mill noted for strong sourcing standards. Integration depends on cotton standard verification and API evaluation. |
| Will Prodigi be retained for apparel, or only for fine-art prints? | Open | Prodigi's apparel print quality needs real-world evaluation before committing to it as the primary apparel vendor. |
| Multi-dropshipper fulfillment abstraction layer | Deferred | Required before a second dropshipper is integrated. Should be scoped as its own epic at that time. |
| Webhook support for physical-original shipment tracking | Deferred | Currently the admin manually enters tracking numbers. Webhook-based automation is desirable but not yet scoped. |
| Will additional sellers ever be onboarded? | Deferred | The role architecture supports it, but there are no concrete plans. Revisit if business model expands. |
| Cart feature scope and UX | Deferred | Flagged as a likely early epic. Not yet designed. |
| Apparel retail pricing model | Open | Two options: (1) seller sets fixed dollar price, margins vary by product; (2) seller sets markup over dropshipper base cost, price floats automatically. Needs research before implementation. Defer until after MFTF-7 ships. |
| Unified browse page (apparel + prints side by side) | Deferred | Conceivable as a catch-all browse page but not the intended primary buyer experience. Revisit after apparel browse (/shop) and fine-art browse (/browse) are both live. |
| T-Mill API integration details | Partially resolved | MFTF-2 spike partially complete from public sources (blocked on 2FA for live access). Key findings: Orders API at api.teemill.com/v1 is the correct integration target (not the Custom Product API). Two-step order flow (create then confirm with shipping method). No sandbox found. Colors are plain name strings. Webhook payload and size catalog require live access. See /docs/teemill-api-notes.md. |
| Per-color lifestyle photography | Deferred | Currently one set of lifestyle photos per listing covers all colorways. Per-color photos possible in future if QA sampling process scales. |
| Buyer reviews with photos | Deferred | Mentioned as a future direction. No scope yet. |

---

## Revision History

| Date | Change | Related epic |
|---|---|---|
| 2026-06-07 | Initial document created | — |
| 2026-06-07 | Added Apparel Product Model, Watermark Modes, Dropshipper Strategy sections; updated Open Questions with pricing model, unified browse, T-Mill API, per-color photos, buyer reviews | MFTF-3 through MFTF-9 |
| 2026-06-07 | Updated Dropshipper Strategy with T-Mill Orders API findings (MFTF-2 partial spike); updated T-Mill API open question status | MFTF-2 |
---

## Apparel Product Model

_Added 2026-06-07. Documents decisions made during MFTF epic design session._

**Founder-curated product catalog.** The platform maintains a small set of approved product types (e.g. "Unisex Tee", "Tote Bag"). Sellers see only these approved types when creating listings — they do not see dropshipper names, SKUs, or the full dropshipper catalog. The mapping from product type to dropshipper and SKU is an admin-level concern, invisible in the seller UI.

**Listing = design × product type.** The same design can appear on multiple product types, but each combination is a separate listing. A "Solar Punk Bee" graphic on a tee and the same graphic on a tote bag are two distinct listings, priced and managed independently.

**Color variants are seller-curated.** Each product type has a set of available colors (defined by the admin in the platform catalog). When creating a listing, the seller selects which subset of those colors to offer. Buyers choose from the seller-curated subset at checkout.

**Size is not variant-priced.** All sizes for a given listing share one retail price. Size selection happens at checkout without affecting price. No per-size stock management at this stage.

**Lifestyle photography is per-listing, not per-color.** A listing has one set of lifestyle photos (from physical QA samples ordered by the founders) shared across all color variants. There are no color-specific photos. The seller upload pipeline processes lifestyle photos through the corner-watermark variant pipeline.

**Design files are clean.** The design image submitted to the dropshipper for printing carries no watermark. It is stored separately from lifestyle photos in Blob storage and is never exposed to buyers.

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

**T-Mill is the primary apparel dropshipper.** Their entire catalog is GOTS-certified 100% organic cotton, satisfying the brand's non-negotiable fabric standard without case-by-case verification.

**T-Mill Orders API** (`https://api.teemill.com/v1`) is the correct integration target — not their Custom Product API (`omnis/v3`), which creates Teemill-hosted storefront listings. The Orders API is a two-step flow: `POST /orders` returns available shipping methods, then `POST /orders/{id}/confirm` finalizes. Authentication is via `Authorization` header + `project` query param. No sandbox environment exists; MSW stubs are required for automated testing. See `/docs/teemill-api-notes.md` for full findings.

**Prodigi is retained for fine-art prints and evaluated for apparel.** Prodigi has some 100% cotton apparel options that have not been ruled out. The integration remains in place; apparel suitability pending real-world evaluation.

**All dropshippers sit behind a shared fulfillment abstraction layer** (`src/lib/fulfillment/`). Adding a new dropshipper requires implementing `FulfillmentProvider` and registering it in the factory — no changes to order processing logic.

**The dropshipper backing a product type is an admin-level configuration**, invisible to sellers and buyers. Sellers see "Unisex Tee"; the platform routes the order to T-Mill or Prodigi based on the `ProductType.fulfillmentProvider` field.

