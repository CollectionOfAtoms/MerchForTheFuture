## Epic MFTF-13: Referenced Apparel Listings (Teemill Product Ref)

_Added 2026-06-12 following live verification of the Teemill Orders API (see `/docs/teemill-api-notes.md`, "Live API Verification 2026-06-12"). Introduces a second apparel sourcing mode — `REFERENCED` — for dropshippers like Teemill where a custom design becomes an orderable catalog product **on the provider's side**, and the listing's blank, design, colours, sizes, mockups, live stock, and base price are all owned by the provider and keyed off one product ref. This is distinct from the existing `DESIGNED` mode (MFTF-4/MFTF-5), where the seller uploads a clean design file onto a founder-curated blank and we own colour/size curation._

_**Why a new mode rather than reworking MFTF-5:** Teemill's builder already fixes blank + design + colours (free tier caps a design at 3 colours), so MFTF-5's admin-curated blank (MFTF-4) and seller colour-curation steps are redundant for Teemill — the catalog is authoritative. Forcing Teemill into the designed-mode model would mean storing curation columns the provider already owns. Instead, both modes share one `ApparelListing` (title, description, sellerId, retailPrice, status, lifestyle photos) and diverge behind a `sourcingMode` discriminator. The listing/browse/cart/checkout core reads a uniform normalized projection (offered colours, sizes, retail price, images); only the `FulfillmentProvider` subclass knows how to turn a line item back into a provider order. If checkout ever branches on "is this Teemill?", the abstraction has leaked._

_**Pricing (resolves the long-open "apparel retail pricing model" question):** retail price is a fixed USD value the seller sets (same `retailPrice` field used by the designed path). Teemill's GBP base price is **cached for margin monitoring only** — it never computes the buyer's sticker. The buyer pays USD; Stripe settles USD; Teemill bills the founders GBP later, at fulfillment. FX exposure therefore lives between collected USD and owed GBP — a margin concern handled out-of-band, post-launch (see Open Questions) — and never enters the checkout total. Checkout does no live FX conversion._

_**Seller opacity refinement:** the "sellers never see dropshipper names/SKUs" principle is preserved for `DESIGNED` listings (the seller picks "Unisex Tee", never a SKU) but is **deliberately dropped for `REFERENCED` listings**, where it was already fictional — the founder logs into Teemill's builder, sees the product, and pastes its ref. The buyer-facing opacity ("Shipment 1 of 2", no provider names) is preserved unconditionally in both modes (MFTF-12.6)._

_**Dependency:** Extends the schema delivered by Passed story US-MFTF-5.1 (additive, schema-touching — see US-MFTF-13.1). Consumed by MFTF-6 (browse/detail must render both modes) and MFTF-11/MFTF-12 (cart line items and checkout re-validation must handle referenced apparel). Requires the MFTF-3 abstraction (Passed) and is finalized by MFTF-12.5 fulfillment fan-out._

_**Live-API confirmation still required before any MFTF-13 story reaches "Passed":** (a) the exact `/catalog/products` JSON field paths that the ingest parser depends on — the verified sample in the API notes is one product; (b) Open Q#7 — how `shippingMethodId` is selected at confirm time (buyer-facing vs. always-standard), which the cached snapshot does not resolve; (c) rate limits, which gate whether checkout-time live stock/price re-reads are safe synchronously inside the 10s Vercel function. These are flagged per story below._

### US-MFTF-13.1 — Referenced Sourcing Mode: Schema Extension

**As a** platform,
**I want** `ApparelListing` to support a `REFERENCED` sourcing mode that caches a Teemill product snapshot, alongside the existing `DESIGNED` mode,
**so that** a listing can be backed either by a seller-uploaded design on a curated blank or by a provider-owned catalog product, without two parallel listing tables.

**Acceptance Criteria:**
- [ ] `ApparelListing` gains `sourcingMode` (enum: `DESIGNED | REFERENCED`, defaults `DESIGNED` so existing rows and US-MFTF-5.1 behavior are unchanged)
- [ ] For `REFERENCED`, `ApparelListing` gains nullable fields: `providerKey` (String — fulfillment registry key, e.g. `"teemill"`), `providerProductRef` (String — the Teemill product `ref`/`id`), `providerBaseCurrency` (String, ISO 4217, e.g. `"GBP"`), `providerBasePrice` (Decimal — cached base cost for margin monitoring, **not** used to compute retail), `snapshotFetchedAt` (DateTime)
- [ ] `productTypeId` and `designImageUrl` become **nullable**; an application-layer invariant requires: `DESIGNED` ⇒ `productTypeId` non-null and `designImageUrl` non-null and zero `ReferencedVariant` rows; `REFERENCED` ⇒ `providerKey` + `providerProductRef` non-null and zero `ApparelListingColor` rows (designed-mode curation does not apply)
- [ ] New `ReferencedVariant` model captures the cached, orderable variant snapshot: `id`, `apparelListingId` (FK), `variantRef` (String — absolute URL `https://api.teemill.com/v1/catalog/variants/{uuid}`), `colorName`, `colorHex` (String — from the variant `Colour` attribute `{type:"color", value}`), `sizeLabel`, `stockLevel` (Int — cached at snapshot time), `isOrderable` (Boolean), `mockupUrl` (String, nullable — per-colour mockup from `variant.images[]`/`product.images[]` tagged by `variantIds`)
- [ ] `retailPrice` semantics unchanged and required in both modes (fixed USD); `providerBasePrice` is monitoring metadata only
- [ ] Schema applied via `prisma db push`; `resetDatabase()` test helper updated to include `ReferencedVariant` in correct cascade order
- [ ] All existing US-MFTF-5.x tests pass unchanged (additive change; defaults preserve designed-mode behavior)

**TDD Notes:**
- Test file: `__tests__/mftf-13-referenced-listing/US-MFTF-13.1-referenced-schema.test.ts`
- **Touches Passed story US-MFTF-5.1** — re-run `__tests__/mftf-5-apparel-listing/` and assert designed-mode round-trip is unchanged; flag in tracker notes
- Invariant tests: a `DESIGNED` listing with a `ReferencedVariant` row fails validation; a `REFERENCED` listing with an `ApparelListingColor` row fails validation; each mode with its required fields null fails validation
- Integration test: create a `REFERENCED` listing with three colours × N sizes of `ReferencedVariant` rows (hex present), query back with relations, assert round-trip including `mockupUrl` and `stockLevel`
- Note: the "exactly one of `productTypeId` / `providerProductRef`" rule is enforced at the application layer (consistent with the existing US-MFTF-5.1 single-FK-per-order convention), not a DB check constraint

---

### US-MFTF-13.2 — Teemill Catalog Ingest

**As a** platform,
**I want** a server-side ingest that resolves a Teemill product ref into a cached snapshot of variants, colours (hex), sizes, mockups, live stock, and GBP base price,
**so that** a referenced listing can render and be ordered from cached data without a live Teemill call on every page view.

**Acceptance Criteria:**
- [ ] An `ingestTeemillProduct(productRef)` function (in `src/lib/fulfillment/teemill/`) calls `GET /catalog/products` with the verified auth: `Authorization: {TEEMILL_API_KEY}` header (**no `Bearer` prefix**) and `?project={sub}` where `sub` is the JWT `sub` claim on the key (`merchforthefuture-451391` for this account — **not** the public key)
- [ ] Parses the matching product into a normalized snapshot: per variant — `variantRef` (absolute `…/catalog/variants/{uuid}` URL), `colorName` + `colorHex` (from the `Colour` attribute), `sizeLabel` (from the `Size` attribute), `stockLevel` (from `stock.level`), `isOrderable` (derived: enabled + stock > 0), `mockupUrl` (matched from `images[]` by `variantIds`); and product-level `providerBaseCurrency` + `providerBasePrice` (from variant `retailPrice`/`price`, GBP)
- [ ] Rejects ingest if the product reports more than the free-tier colour cap is not assumed — ingest stores whatever colours the catalog returns (the 3-colour cap is a Teemill account constraint, not a validation rule we enforce)
- [ ] Ingest is idempotent for a given `apparelListingId`: re-running replaces the listing's `ReferencedVariant` rows and refreshes `providerBasePrice`/`snapshotFetchedAt` rather than duplicating
- [ ] Surfaces a clear error if the ref is not found in the project (`404`), auth fails, or the product is disabled — these are returned to the caller, not thrown uncaught
- [ ] Design files are **not** uploaded or stored for referenced listings (Teemill owns the design); the designed-mode Blob design-file path is not invoked

**TDD Notes:**
- Test file: `__tests__/mftf-13-referenced-listing/US-MFTF-13.2-teemill-ingest.test.ts`
- MSW: stub `GET https://api.teemill.com/v1/catalog/products` with the **verified** "Powered By Plants" shape from `/docs/teemill-api-notes.md` (3 colours with hex, 15 variants, per-warehouse stock, `images[].variantIds`, GBP prices, `…/catalog/variants/{uuid}` refs)
- Unit tests: parser maps colour hex correctly; mockup matched to correct variant by `variantIds`; `isOrderable` false when `stock.level` is 0; idempotent re-ingest replaces not duplicates
- Auth test: assert header has no `Bearer` prefix and `project` query param equals the configured `sub`, not the public key
- **Live-API confirmation flag:** exact JSON field paths verified against one product only; before this story is marked Passed, confirm the parser against a second live product (especially `images[].variantIds` linkage and the `attributes` array ordering)

---

### US-MFTF-13.3 — Create Referenced Listing (Paste Teemill Ref)

**As a** seller (founder),
**I want** to create an apparel listing by pasting a Teemill product link/ref, then set a USD price and upload lifestyle photos,
**so that** I can list a product I built on Teemill's site without re-entering blank, colours, or sizes that Teemill already owns.

**Acceptance Criteria:**
- [ ] A "New referenced listing" option is available from the seller dashboard alongside "New apparel listing" (designed) and "New artwork listing"
- [ ] Step 1 — Product: the step opens with a clear instruction that the design must be created on Teemill **first** — the form does not create the product, it references one that already exists. Includes (a) a prominent outbound link/button to Teemill's designer (opens in a new tab), and (b) a short blurb explaining exactly how to obtain the product ref from a finished Teemill product (e.g. "Once your design is published on Teemill, open the product and copy its link/ref — paste it below"). Copy must not assume the seller already knows the Teemill workflow
- [ ] Step 1 — Product (cont.): a field to paste the Teemill product link or ref; on submit, the form calls ingest (US-MFTF-13.2) and shows a preview of the resolved product (title pulled from catalog, colour swatches with hex, size list, per-colour mockups, GBP base price shown as founder-facing margin context labelled "your cost, GBP")
- [ ] If ingest cannot resolve the pasted value (not found / not in this project / disabled), the error explains the likely cause and re-surfaces the "design on Teemill first, then copy the ref" guidance rather than a bare failure
- [ ] The form **openly identifies Teemill** as the provider for this listing (seller opacity is intentionally not applied in referenced mode); copy makes clear the colours/sizes/mockups come from the Teemill product and cannot be edited here
- [ ] Step 2 — Merchandising: editable `title`, `description`, fixed USD `retailPrice` (required, min $1); a margin hint compares retail to `providerBasePrice × an indicative rate` for founder eyeballing (display-only; no live FX call, no enforcement)
- [ ] Step 3 — Lifestyle photos: optional upload through the existing corner-watermark variant pipeline (US-MFTF-5.2); if no lifestyle photos are uploaded, the cached Teemill mockups serve as the listing's images
- [ ] Step 4 — Review & Publish: summary with edit links; "Save as Draft" (`ARCHIVED`) and "Publish" (`ACTIVE`)
- [ ] `createReferencedListingAction` validates: ref resolved successfully, retail ≥ min, at least one orderable variant present; persists `ApparelListing` (`sourcingMode: REFERENCED`) plus `ReferencedVariant` rows
- [ ] Unauthenticated or non-seller callers receive `{ error: 'Unauthorized' }`

**TDD Notes:**
- Test file: `__tests__/mftf-13-referenced-listing/US-MFTF-13.3-create-referenced-listing.test.ts`
- MSW: reuse the verified catalog stub from US-MFTF-13.2
- Unit tests: invalid/unresolvable ref surfaces an error and blocks publish; retail below min rejected; publish with zero orderable variants rejected
- Integration test: happy path creates `ApparelListing` (REFERENCED) + `ReferencedVariant` rows; with no lifestyle photos uploaded, listing image source falls back to cached mockups
- Note: the indicative-rate margin hint is display-only and must not perform a network FX lookup (keeps the action inside the 10s function and deterministic in tests)
- Component test: Step 1 renders the "design on Teemill first" guidance, the outbound designer link (new tab), and the how-to-find-the-ref blurb before any ref is entered; an unresolvable ref re-surfaces that guidance in the error state

---

### US-MFTF-13.4 — Edit / Re-Sync Referenced Listing

**As a** seller,
**I want** to edit a referenced listing's price and photos and re-sync it against Teemill,
**so that** I can refresh colours, stock, mockups, and base price when the Teemill product changes, and adjust my USD price.

**Acceptance Criteria:**
- [ ] Edit page at `/seller/apparel/[listingId]/edit` detects `sourcingMode` and renders the referenced variant of the form (read-only Teemill-owned data + editable merchandising)
- [ ] Seller can edit `title`, `description`, `retailPrice`, and lifestyle photos (add/remove/reorder)
- [ ] Seller **cannot** edit colours, sizes, or the design here; a "Re-sync from Teemill" action re-runs ingest (US-MFTF-13.2) and reports what changed (e.g. "Evergreen is now out of stock", "base price changed £19 → £21")
- [ ] The page provides an **"Edit on Teemill"** outbound link/button (opens in a new tab) that deep-links to this product's designer/editor on Teemill, so the seller can change the design and then return to re-sync. After editing on Teemill, the page guides the seller to run "Re-sync from Teemill" to pull the changes into the cached snapshot
- [ ] The deep-link is derived from a stored Teemill identifier (the product `ref`/`slug` captured at ingest); if a stable per-product **editor** URL cannot be constructed (see live-confirm flag), the link falls back to the seller's Teemill product dashboard or the generic designer entry point rather than rendering a broken or guessed URL
- [ ] `providerProductRef` cannot be changed after creation (changing the underlying product is a new listing, mirroring the designed-mode "product type cannot change" rule)
- [ ] Re-sync that drops a previously-orderable variant which has pending/paid orders does not delete order history; the variant row is marked `isOrderable: false` rather than removed
- [ ] `updateReferencedListingAction` validates ownership and persists; sold/archived states follow the same read-only/edit rules as designed listings

**TDD Notes:**
- Test file: `__tests__/mftf-13-referenced-listing/US-MFTF-13.4-edit-resync-referenced-listing.test.ts`
- MSW: catalog stub variant with changed stock/price to exercise the re-sync diff
- Unit tests: attempt to change `providerProductRef` rejected; re-sync marks vanished-but-ordered variant `isOrderable:false` instead of deleting
- Integration test: edit retail + re-sync, assert `ReferencedVariant` rows and `providerBasePrice` refreshed and a human-readable change summary returned
- Component test: "Edit on Teemill" link renders, opens in a new tab, and is built from the stored ref/slug; when no editor-URL pattern is configured, asserts the fallback link (dashboard / generic designer) is used instead of a broken URL
- **Live-API confirmation flag (gates the deep-link criterion):** confirm whether Teemill exposes a stable per-product **editor** deep-link URL (and whether it requires the founder's authenticated Teemill session). The catalog gives `ref` and `slug`; the editor URL pattern is unverified. Until confirmed, ship the fallback link; the precise deep-link is a follow-up once the pattern is known
- Auth guard: non-owner returns error
