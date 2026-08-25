## Epic MFTF-17: Printify Integration

_**Material-standard gate cleared 2026-07-11.** Printify's catalog has been confirmed to include options meeting the brand's material standard (sustainably sourced AND biodegradable; natural fibers only; all-biodegradable blends acceptable; no synthetics), with specific styles identified for the site. This clears the New-Provider Pattern gate (see project_description.md → New-Provider Pattern) and unblocks scheduling. Follows the same three-phase shape used for Teemill (MFTF-2 spike → MFTF-13 implementation): **(1) API discovery**, written up in `/docs/printify-api-notes.md`, resolves whether Printify is integrated as a `DESIGNED` or `REFERENCED` source (this is an open question — Printify's product-creation flow has not yet been evaluated against the codebase's two sourcing modes, unlike Teemill where the builder-owns-everything shape was obvious going in); **(2) implementation**, subclassing the `FulfillmentProvider` abstract base (US-MFTF-12.1), registering in the factory, and integrating at the catalog + order + status-mapping (MFTF-14.2) layers per whichever mode US-MFTF-17.1 resolves, preserving buyer-opacity throughout; **(3) founder confirmation**, a live-order sanity check against the founders' own account before the epic can move to Passed. This is the epic currently being implemented; MFTF-18 (Printful) follows the identical shape once Printify's discovery findings de-risk the second integration._

_**Dependency:** Requires MFTF-12.1 (abstract base class, Passed) and MFTF-14.2 (status-mapping layer). Extends the catalog layer at either MFTF-4 (if `DESIGNED`) or the MFTF-13 pattern (if `REFERENCED`) depending on what US-MFTF-17.1 finds — US-MFTF-17.2 cannot be scoped in detail until then, so its acceptance criteria below are written at the interface/outcome level and will be sharpened once the sourcing mode is known, mirroring how MFTF-7 was written pre-spike against MFTF-2._

### US-MFTF-17.1 — Printify API Discovery Spike

_Tracked as a chore, not a TDD user story. Output is a decision document, not shipped code — same convention as MFTF-2._

**Scope:** Resolve Printify account/API access, make exploratory API calls against a sandbox or live account, and document findings in `/docs/printify-api-notes.md`. This document unblocks US-MFTF-17.2 and determines whether Printify is `DESIGNED` or `REFERENCED`.

**Investigate and document:**
- [ ] Product creation model: does Printify require selecting a blank + uploading a design via API (favors `DESIGNED`), or is a product built in Printify's own UI/dashboard and then referenced by ID (favors `REFERENCED`)? This is the central question the spike must answer before US-MFTF-17.2 can be scoped
- [ ] Catalog access: how blueprints/blanks, colors (with hex), and sizes are retrieved; whether the confirmed qualifying styles (identified as meeting the material standard) are addressable individually or require enumerating the full catalog
- [ ] Variant/SKU shape: what identifies an orderable variant, whether stock is warehouse-based or print-on-demand (Teemill's BUG-13 lesson — verify this explicitly rather than assuming warehouse-stock semantics), and what fields a cached snapshot would need if `REFERENCED`
- [ ] Order submission: required fields, whether it's a single-step or multi-step flow (Teemill's two-step quote-then-confirm shape is not assumed to generalize), how shipping is quoted, what confirmation/response comes back
- [ ] Webhooks vs. polling: what events exist for fulfillment status, payload shape, and whether webhook support is confirmed live (default to polling per `checkFulfillmentStatus()` until proven, per the Teemill precedent)
- [ ] Authentication: API key format, rate limits, sandbox vs. live environment behavior, and any account/shop-scoping concept analogous to Teemill's `project` claim
- [ ] Pricing/currency: base currency Printify bills in, and whether it matches the existing "fixed USD retail, provider cost cached for margin-monitoring only, no live FX at checkout" model used for both Prodigi and Teemill — flag if Printify's model doesn't fit cleanly
- [ ] Mockups: whether Printify provides usable per-variant mockup images (relevant if `REFERENCED`) or none (relevant if `DESIGNED`, where the existing lifestyle-photo pipeline would apply instead)
- [ ] Confirm the previously-verified qualifying styles' exact blueprint/product IDs and colorways, so US-MFTF-17.2 can scope to the intended catalog subset rather than the full Printify catalog

**Deliverable:** `/docs/printify-api-notes.md` with a clear recommendation — `DESIGNED` or `REFERENCED` — and the findings needed to write US-MFTF-17.2's acceptance criteria at the same level of detail as MFTF-13.

---

### US-MFTF-17.2 — Printify Provider Integration

**As a** platform,
**I want** Printify integrated as a fulfillment provider using whichever sourcing mode US-MFTF-17.1 determines,
**so that** sellers can list Printify-fulfilled apparel through the same normalized listing/cart/checkout core used by Prodigi and Teemill.

**Acceptance Criteria — mode-independent (apply regardless of US-MFTF-17.1's finding):**
- [ ] `PrintifyFulfillmentProvider` in `src/lib/fulfillment/providers/printify.ts` extends the `FulfillmentProvider` abstract base class (US-MFTF-12.1) and implements every abstract method, including `quoteShipping()` and `checkFulfillmentStatus()`; a subclass missing any abstract method fails TypeScript compilation
- [ ] Registers in the provider factory; no changes to order-processing/checkout code are required to add it
- [ ] Only the confirmed material-standard-qualifying styles/blueprints identified during verification are ever exposed through this integration — the catalog is scoped, not the full Printify catalog
- [ ] Buyer-facing opacity is preserved unconditionally: no Printify branding, SKUs, or provider name surface to buyers ("Shipment N of M" convention, matching Prodigi and Teemill)
- [ ] Shipment status is detected via `checkFulfillmentStatus()`; webhook-based detection is used only if US-MFTF-17.1 confirms live webhook support and payload shape — otherwise this ships on polling, matching the Teemill precedent, and the status-mapping layer (US-MFTF-14.2) receives the same canonical `FulfillmentStatus` set (`PROCESSING | PRINTING | SHIPPED | DELIVERED | CANCELLED | ERROR`) regardless of detection mechanism
- [ ] Pricing follows the existing model unless US-MFTF-17.1 flags a reason it can't: fixed USD retail set by the seller; Printify's base cost cached for margin-monitoring only; no live FX conversion in the checkout total
- [ ] Multi-item cart orders containing a Printify line item split correctly into their own `FulfillmentOrder` row alongside any Prodigi/Teemill items in the same order, per the existing MFTF-12 per-provider fan-out

**Acceptance Criteria — if `DESIGNED` (seller uploads onto a founder-curated blank, per US-MFTF-17.1 finding):**
- [ ] The confirmed qualifying Printify blueprints are added to the founder-curated product catalog (MFTF-4 pattern); sellers see only approved product types, never Printify SKUs
- [ ] Seller-curated color variants follow the MFTF-5 designed-mode flow (admin defines available colors per product type; seller selects a subset)
- [ ] Design files are submitted to Printify at order time with no watermark, following the existing Prodigi/MFTF-5 design-file path

**Acceptance Criteria — if `REFERENCED` (founder builds product in Printify's own UI and references it, per US-MFTF-17.1 finding):**
- [ ] Extends `ApparelListing`/`ReferencedVariant` (US-MFTF-13.1 schema) with a Printify `providerKey`, following the same additive pattern used for Teemill rather than introducing parallel models
- [ ] A seller-facing "New referenced listing" flow (or an extension of the existing one) supports pasting a Printify product reference, following the US-MFTF-13.3 UX pattern (outbound link to Printify's product builder, guidance on obtaining the reference, ingest-and-preview on submit)
- [ ] A Printify catalog ingest function caches variants, colors (hex), sizes, mockups (if available per US-MFTF-17.1), stock/orderability, and base price into `ReferencedVariant` rows, following the US-MFTF-13.2 ingest pattern
- [ ] Re-sync/edit follows the US-MFTF-13.4 pattern (read-only provider-owned fields, editable merchandising, "Re-sync from Printify" action)

**TDD Notes:**
- Test file: `__tests__/mftf-17-printify/US-MFTF-17.2-printify-provider.test.ts` (mode-independent tests) plus mode-specific test files once US-MFTF-17.1 resolves the sourcing mode (e.g. `US-MFTF-17.2-printify-designed-catalog.test.ts` or `US-MFTF-17.2-printify-referenced-listing.test.ts`)
- MSW: stub Printify's catalog/order endpoints per the verified shapes in `/docs/printify-api-notes.md` — no sandbox is assumed available; verify during the spike and note in the doc if one exists
- Type-level test: `@ts-expect-error` fixture confirming a subclass missing an abstract method fails compilation (same pattern as US-MFTF-12.1)
- Unit tests: catalog scoping (only qualifying styles exposed), buyer-opacity (no provider name/SKU in any buyer-facing payload), pricing (no live FX call)
- Integration test: multi-item cart order with a Printify line item alongside a Teemill or Prodigi line item, assert correct per-provider `FulfillmentOrder` split and independent fulfillment (one provider's failure doesn't block another)
- **This story cannot reach Passed until US-MFTF-17.1's findings are incorporated and US-MFTF-17.3 (founder confirmation) succeeds against a live order**

---

### US-MFTF-17.3 — Founder Confirmation: Live Printify Order

**As a** founder,
**I want** to place and confirm one real order through the Printify integration before it goes live for buyers,
**so that** the integration is validated against Printify's actual API behavior, not just MSW-stubbed assumptions.

**Acceptance Criteria:**
- [ ] A founder places a real order (using a founder-owned address, not a synthetic test address) through the Printify integration in a live/production-adjacent environment
- [ ] The order is confirmed to have been received correctly on Printify's side (matching product, color, size, design/reference)
- [ ] Shipment status detection (webhook or polling, per US-MFTF-17.1/17.2) is confirmed to reflect real status changes, not just the MSW-stubbed happy path
- [ ] Any discrepancy between `/docs/printify-api-notes.md`'s documented shapes and the live behavior observed is recorded as an update to that doc, and any resulting code fix is scoped as a follow-up story rather than silently patched
- [ ] Only after this story passes does Epic MFTF-17 move from "implemented, pending live confirmation" to fully Passed, matching the `statusLegend` convention ("Tests Passing — pending live confirmation") already used elsewhere in this tracker for live-API-dependent stories

**TDD Notes:**
- Not unit-testable in the conventional sense — this is a manual founder-executed verification story, tracked in the tracker like other stories but without an automated test file
- Document the live order's provider order ID and outcome in `/docs/printify-api-notes.md` under a "Live Confirmation" section, following the precedent set by the Teemill live-verification notes

---

### US-MFTF-17.4 — Live Printify Variant Availability (product page + checkout)

_Added 2026-08-15 after a live-catalog finding during US-MFTF-17.2: Printify's
`variants.json` **hides out-of-stock variants** unless `?show-out-of-stock=1` is passed
(verified — blueprint 1580 "Women's Baby Tee" / provider 99: 4 default vs 16 full variants).
The variant object carries no availability field, so a variant is "orderable now" iff it appears
in the DEFAULT (no-flag) list. US-MFTF-17.2 now caches the **full** range; this story surfaces
live per-variant availability to the buyer so an out-of-stock colour/size is never purchasable —
mirroring the Teemill `isOrderable` live re-check already in `revalidate.ts`, extended with a
product-page presentation._

**As a** buyer,
**I want** out-of-stock colour/size options greyed out on the product page and re-checked at
checkout,
**so that** I never add or pay for a Printify variant that can't actually be fulfilled — including
the case where an item sat in my cart for days and sold out in the meantime.

**Acceptance Criteria:**
- [ ] A live availability read (`getPrintifyAvailability(blueprintId, printProviderId)` — the
      DEFAULT, no-flag `variants.json`, returning the set of currently-orderable `(colour,size)`
      combos) is added; the cached full range minus this set is the "unavailable" set.
- [ ] `ApparelDetail` gains an availability signal (e.g. an `unavailable: {color,size}[]` list),
      defaulted to empty for non-Printify listings so Prodigi/Teemill rendering is unchanged;
      populated only for DESIGNED Printify listings via the live read at detail-build time.
- [ ] On the product page, a `(colour,size)` in the unavailable set is **greyed out and not
      selectable**; a colour whose every size is unavailable is greyed out entirely; selecting a
      colour clears a now-unavailable selected size; "Add to cart" cannot be triggered for an
      unavailable combo.
- [ ] At checkout, `revalidateCheckout` re-checks Printify availability for each Printify cart
      item and removes any now-unavailable item with a clear "no longer available" message —
      identical treatment to the existing Teemill `isOrderable` drop.
- [ ] **Fail-open**, matching the Teemill precedent: if the Printify availability read fails or
      times out, fall back to treating the cached variants as available (never block browsing or
      checkout on a provider hiccup). The catalog itself stays complete because US-MFTF-17.2
      caches with `?show-out-of-stock=1`.
- [ ] Buyer-opacity preserved: no Printify name/blueprint/variant id in any buyer-facing payload.

**TDD Notes:**
- Test files: `__tests__/mftf-17-printify/US-MFTF-17.4-availability-detail.test.ts` (projection:
  unavailable set computed from the MSW default-vs-full split; fail-open on API error),
  `US-MFTF-17.4-availability-checkout.test.ts` (revalidate drops an unavailable Printify item,
  keeps available ones, fail-open), and a jsdom `US-MFTF-17.4-availability-view.test.tsx`
  (greyed-out options are disabled + unselectable; a fully-OOS colour is disabled).
- MSW already models the split (`show-out-of-stock=1` → full; default → in-stock subset) in
  `__tests__/mocks/handlers.ts`.
- Gated to DESIGNED Printify listings; the referenced/Prodigi paths keep their current behaviour.

---

### US-MFTF-17.5 — Admin Printify Curation by URL + Stock-Image Preview

_Added 2026-08-15. The admin "New product type" form originally required typing the raw
`printifyBlueprintId` + `printifyPrintProviderId` — but those ids are not shown on Printify's
public catalog pages (only the blueprint id is, embedded in the product URL). This story lets the
admin paste the catalog URL and previews the product, mirroring the Teemill referenced-listing
"paste a link → resolve → preview" flow (US-MFTF-13.3)._

**As an** admin curating the catalog,
**I want** to paste a Printify product URL and see the product's stock images before I add it,
**so that** I can curate the right blueprint + print provider without hunting for API ids by hand.

**Acceptance Criteria:**
- [ ] The Printify branch of the admin product-type form accepts a **Printify catalog URL** (e.g.
      `https://printify.com/app/products/1580/...`) or a bare blueprint id; the blueprint id is
      parsed from the URL (`/products/{id}`).
- [ ] A "Look up" action (`resolvePrintifyUrlAction`, admin-guarded, read-only) resolves the URL
      to the blueprint's title/brand + its **stock catalog images** + the **print providers** that
      offer it, and the form renders the stock images and a provider picker.
- [ ] Because a URL carries only the blueprint id and a blueprint has many print providers, the
      admin **selects the print provider** from the resolved list; the chosen provider id + the
      resolved blueprint id are what the create action persists (existing US-MFTF-17.2 validation
      + sync unchanged).
- [ ] Clear errors for an unrecognisable link, an unknown blueprint, or a blueprint with no
      providers; a non-admin is rejected.
- [ ] The material-standard gate is unchanged (manual founder curation; the API exposes no fabric
      composition) — the preview is a convenience, not an auto-approval.

**TDD Notes:**
- Test files: `__tests__/mftf-17-printify/US-MFTF-17.5-resolve-printify-url.test.ts` (action:
  URL/id parsing, blueprint+providers resolution, error + auth paths, MSW) and a jsdom
  `US-MFTF-17.5-url-lookup-form.test.tsx` (form shows the URL field, renders stock images, and
  populates the provider picker after look-up).
- MSW gains `GET /catalog/blueprints/:id.json` + `.../print_providers.json` handlers.
- Live-verified shapes (blueprint 1580 returns 7 stock images; providers 99/217), so this reaches
  Passed via MSW and does not depend on US-MFTF-17.3.

---

### US-MFTF-17.6 — Designed Stock Images for Sellers (+ admin edit-page provider fix)

_Added 2026-08-15. Two related fixes to the Printify admin/seller surfaces._

**BUG-17 (bundled here):** the admin product-type **edit** page (`/admin/products/[id]`) and
`SyncProductButton` were written Teemill-vs-else(Prodigi), so a **Printify** product type showed
the "Prodigi" tag, the Prodigi blank-uploader hero, and a "Sync from Prodigi" button that called
the Prodigi sync. Fixed to be provider-aware: correct "Printify" tag, blueprint/provider subtitle,
and a "Sync from Printify" button wired to `syncProductTypeFromPrintifyAction`.

**As a** seller designing a product,
**I want** to see the product's stock images while I design,
**so that** I know what garment/colour I'm putting my artwork onto.

**Acceptance Criteria:**
- [ ] When a DESIGNED Printify product type is synced, the blueprint's stock images are captured
      onto the product type (`ProductType.stockImageUrls`, a JSON string[]); best-effort — a failed
      image fetch never fails the sync or wipes existing images.
- [ ] The seller listing-creation flow shows the selected product type's stock images as design
      reference (empty/hidden when none captured); buyer-facing pages are untouched (no provider
      identity leaks).
- [ ] The admin edit page renders the captured stock images as the hero for a Printify product
      type (replacing the Prodigi blank-uploader) and is provider-aware everywhere (tag, subtitle,
      sync button + label, empty-state copy).
- [ ] Storage note: the stable `images.printify.com/{hash}` catalog URLs are stored (not re-hosted
      to Blob); re-hosting is a possible follow-up if self-hosting is later required.

**TDD Notes:**
- `ProductType.stockImageUrls Json?` (db push both DBs). `fetchPrintifyBlueprintImages` +
  capture in the sync; `toStockImages` normaliser + `stockImages` on the
  `getActiveProductTypesForListing` projection.
- Test files: `US-MFTF-17.6-stock-images.test.ts` (sync captures images; projection exposes them),
  `US-MFTF-17.6-sync-button.test.tsx` (provider-aware label + action), and
  `US-MFTF-17.6-seller-reference.test.tsx` (form renders the reference images).
- Live-verified image shape (blueprint 1580 → 7 stock images), so Passed via MSW; no dependency
  on US-MFTF-17.3. Generalises to any DESIGNED provider that later populates `stockImageUrls`
  (Prodigi image capture is a possible follow-up).

---

### US-MFTF-17.7 through US-MFTF-17.11 — Seller Apparel Design/Placement Tool

_Scoped 2026-08-16 (`tdd-spec-session`), resolving the EMERGING placeholder raised by the founder
2026-08-15. **The gap:** a seller uploads one design file (`ApparelListing.designImageUrl`) but has
no control over how it sits on the garment — `PrintifyFulfillmentProvider.createProviderOrder`
hardcodes the placement to dead-centre, full-scale, front only
(`print_areas` `x:0.5, y:0.5, scale:1, angle:0`). No size/position/rotation control exists — the
apparel analog of the print **framing** tool (Epic MFTF-PF) doesn't exist. Split into five stories
(data capture → tool UI → order-time wiring → preview spike → preview implementation) instead of
one, following the same shape as the US-MFTF-17.1→17.2 (spike → implementation) pattern already
used elsewhere in this epic. Founder-ratified decisions this session resolved:_

- _**Control level:** full freeform drag + scale + rotate — parity with Printify's `x/y/scale/angle`
  fields — reusing the `FramingTool`/`crop-geometry` pointer-drag pattern (US-MFTF-PF.3), extended
  with scale and rotation instead of a fixed-aspect crop rect. Rejected the simpler
  centre/fill/fit-preset option: the drag interaction is already proven in this codebase and gives
  sellers real control, not just a size knob._
- _**Front vs. back:** front only. `ApparelListing` has exactly one design file and the current
  hardcoded placement is already front-only; back printing needs a second design-file upload slot
  and doubled placement UI/schema — real scope growth, logged below as a deferred follow-up rather
  than built here._
- _**Preview:** the tool's live editing canvas needs an immediate design-over-print-area composite
  regardless of anything else — that's inherent to a drag tool, not a deferred decision, and ships
  as part of US-MFTF-17.8. The genuinely open question is whether a higher-fidelity,
  Printify-mockup-based preview (create a draft product, pull photorealistic mockups) is worth its
  operational cost. Split into a spike (US-MFTF-17.10, mirrors the US-MFTF-17.1 discovery-spike
  pattern) and a follow-up story (US-MFTF-17.11) whose acceptance criteria are written at the
  outcome level pending the spike's finding — the same technique US-MFTF-17.2 used for the
  DESIGNED-vs-REFERENCED uncertainty before US-MFTF-17.1 resolved it._
- _**Granularity:** one placement per listing, applied across every offered colour/size — matches
  the existing one-design-file, one-shared-retail-price model (US-MFTF-5.1). Per-variant
  print-area pixel-size drift (US-MFTF-17.7 captures one representative dimension, not an exact
  one per variant) is treated as acceptable, not a defect, given it was already the case before
  this tool existed (the hardcoded default ignores variant dims entirely)._
- _**Generalization:** Printify-first, per the New-Provider Pattern's "one epic per new
  provider/API" principle. Prodigi apparel has the identical auto-fill gap, but is not touched by
  this epic — logged as a new row in project_description.md's Open Questions rather than assumed
  to follow automatically._

_**Dependency:** US-MFTF-17.7 extends the US-MFTF-17.2 catalog sync additively (no schema
conflict, no change to existing sync behavior). US-MFTF-17.8 depends on US-MFTF-17.7's captured
print-area dims. US-MFTF-17.9 depends on US-MFTF-17.8's persisted placement. US-MFTF-17.10 (the
preview spike) needs only read-only Printify catalog/product access and can run independently, any
time after US-MFTF-17.2 — it gates only US-MFTF-17.11, not US-MFTF-17.7–17.9. None of these five
stories are blocked by US-MFTF-17.3 (founder live order), but per the same convention used
elsewhere in this epic, US-MFTF-17.9 cannot reach `Passed` until a live order confirms the
positioned `print_areas` form actually reaches production correctly (see its TDD Notes)._

---

### US-MFTF-17.7 — Capture Printify Print-Area Placeholders at Sync

**As a** platform,
**I want** the Printify catalog sync to capture each curated variant's front print-area pixel
dimensions,
**so that** the placement tool (US-MFTF-17.8) and order-time wiring (US-MFTF-17.9) have real
print-area geometry to work against instead of assuming a fixed default.

**Acceptance Criteria:**
- [ ] `fetchPrintifyCuratedVariants` (or a sibling function reading the same already-fetched
      `variants.json` response) captures each variant's `placeholders` array — currently fetched
      but discarded — and extracts the entry where `position === "front"`
- [ ] A new nullable JSON column, `ProductType.printifyPrintAreas`, is populated at sync time with
      shape `{ front: { width: number, height: number } }` (front only, per this scope's
      front-only decision; the shape leaves room for a `back` key without a migration if
      US-MFTF-17.7's front-only scope is later extended)
- [ ] Because per-variant front print-area dimensions can differ slightly (e.g. by size), the sync
      computes ONE representative dimension per product type: the modal (most frequently
      occurring) `{width,height}` pair across all curated variants' front placeholders — ties
      broken by preferring the value from the median-ranked size (by `sizeRank`) — consistent with
      this session's per-listing (not per-variant) granularity decision
- [ ] A curated variant missing a `front` placeholder is excluded from the mode computation without
      failing the sync (best-effort, matching the existing `stockImageUrls` best-effort precedent
      already in `syncOneType`)
- [ ] If NO curated variant has a `front` placeholder (not observed live, but defensive),
      `printifyPrintAreas` stays `null` and the placement tool (US-MFTF-17.8) shows a
      "placement isn't available for this product yet" state rather than erroring
- [ ] Existing sync behavior (sizes, colors, combo→variantId map, stock images) is unchanged by
      this addition — verified by the existing US-MFTF-17.2/17.6 sync tests staying green

**TDD Notes:**
- Test file: `__tests__/mftf-17-printify/US-MFTF-17.7-printify-print-area-sync.test.ts`
- Unit test: an MSW variants fixture with differing per-size front placeholder dims → assert the
  modal dimension is chosen; a second fixture with a tie → assert the median-size tie-break
- Unit test: a variant with no `placeholders` entry for `front` (e.g. a decoration method with no
  front area) is excluded from the mode computation; sync still succeeds for the rest
- Unit test: re-sync updates `printifyPrintAreas` in place (no duplication), matching the existing
  upsert-by-key pattern used for `ProductTypePrintifyVariant` rows
- Regression: run the existing `US-MFTF-17.2-printify-designed-catalog.test.ts` and
  `US-MFTF-17.6-stock-images.test.ts` suites to confirm colours/sizes/variants/stock-image capture
  is unaffected

---

### US-MFTF-17.8 — Seller Design Placement Tool (Drag, Scale & Rotate)

**As a** seller,
**I want** to drag, resize, and rotate my design within the product's front print area,
**so that** I control exactly how my design sits on the garment instead of getting a fixed
dead-centre placement I can't adjust.

**Acceptance Criteria:**
- [ ] A placement panel renders on the DESIGNED Printify listing's edit page (an edit-page panel,
      following the `PrintFramingPanel` precedent — not the creation form), gated to Printify
      DESIGNED listings whose product type has a captured `printifyPrintAreas.front`
      (US-MFTF-17.7); other DESIGNED providers (Prodigi) show no placement panel in this scope
- [ ] The tool's editing canvas overlays the seller's design over a representation of the front
      print area — bounded to the print area's aspect ratio (derived from
      `printifyPrintAreas.front.width`/`height`) — rendered against the product type's captured
      stock image (US-MFTF-17.6) where available, else a plain bounded rectangle; this composite
      is the interactive editing surface (instant, in-browser, no external API calls), separate
      from the higher-fidelity preview scoped in US-MFTF-17.10/17.11
- [ ] The seller can drag the design to reposition it, drag a resize handle to scale it, and drag a
      rotate handle to rotate it, following the existing `FramingTool`/`crop-geometry` pointer-event
      pattern (pure geometry helpers + a thin client component) extended with `scale` and `angle`
      instead of a fixed-aspect crop rect
- [ ] Geometry is normalized to exactly Printify's positioned `print_areas` shape:
      `x`/`y` are the design's center as a fraction (0–1) of the print area, `scale` is the
      design's width as a fraction of the print area's width, `angle` is rotation in degrees — so
      persisting these four numbers requires no translation at order time (US-MFTF-17.9)
- [ ] Scale is clamped to a provisional range (e.g. `[0.1, 3.0]`) preventing a degenerate near-zero
      or absurdly oversized design; **// UNVERIFIED** — Printify's own accepted `x`/`y`/`scale`/
      `angle` ranges are unconfirmed without a live order (same caveat class as the rest of this
      epic's order-shape items); the provisional client-side clamp is a safety net, not a
      confirmed Printify limit, and may need adjusting once observed live
- [ ] A "Reset to centered" action deletes any saved placement row for the listing, returning it to
      Printify's default centered behavior (`x:0.5, y:0.5, scale:1, angle:0`) — functionally
      identical to a listing that has never used the tool, so "no row" and "explicitly centered"
      are never two different states to reason about
- [ ] Placement is confirmed/persisted via a server action (`confirmPrintifyPlacementAction`),
      following the `confirmFramingAction` pattern: validates the caller owns the listing,
      validates the four values are finite numbers within their clamped ranges, and upserts ONE
      placement row per listing (per the Granularity decision — no per-variant rows)
- [ ] New model `ApparelListingPrintifyPlacement` is keyed uniquely by `apparelListingId` (one row,
      updated in place on re-save): `{ id, apparelListingId (unique), x, y, scale, angle,
      createdAt, updatedAt }`
- [ ] Re-opening the tool pre-loads the currently-saved placement (`x`/`y`/`scale`/`angle`),
      matching `FramingTool`'s `initialRect` re-open behavior; a listing with no saved row opens at
      the centered default
- [ ] A listing with no saved placement row falls back to the centered default at order time
      (US-MFTF-17.9) — placement is opt-in fine-tuning, **not** a new publish gate. Unlike
      Epic MFTF-PF's hard print-framing gate, this does NOT block a listing from going/staying
      `ACTIVE`, because the fallback (auto-centered) is always a valid, already-shipping behavior

**TDD Notes:**
- New pure module `src/lib/apparel/placement-geometry.ts` (mirrors `crop-geometry.ts`):
  `defaultPlacement()` → `{x:0.5,y:0.5,scale:1,angle:0}`, `movePlacement`, `scalePlacement`,
  `rotatePlacement`, `clampPlacement` — unit-tested in isolation, no DOM
- Test file: `__tests__/mftf-17-printify/US-MFTF-17.8-placement-geometry.test.ts` (pure geometry:
  clamps at the scale/position boundaries, defaults, move/scale/rotate round-trips)
- jsdom component test: `US-MFTF-17.8-placement-tool.test.tsx` — drag updates `x`/`y`, the resize
  handle updates `scale` within clamps, the rotate handle updates `angle`, "Reset to centered"
  clears a saved placement, re-open pre-loads a saved placement, the panel does not render for a
  product type with no `printifyPrintAreas`
- Server action test: `US-MFTF-17.8-confirm-placement-action.test.ts` — non-owner rejected,
  out-of-range values rejected, a second save updates the existing row rather than duplicating it
  (unique-by-`apparelListingId` upsert), "reset" deletes the row

---

### US-MFTF-17.9 — Order-Time Placement Wiring

**As a** platform,
**I want** the Printify order line to send the seller's saved placement instead of the hardcoded
centered default when one exists,
**so that** a buyer's printed garment matches what the seller configured in US-MFTF-17.8.

**Acceptance Criteria:**
- [ ] `toQuoteItem` (`src/lib/checkout/fanout.ts`) reads the listing's saved
      `ApparelListingPrintifyPlacement` row when present and attaches it to the
      `ShippingQuoteItem` as a new optional `placement: {x,y,scale,angle}` field, alongside the
      existing `printArea`; omits it (`undefined`) when no placement row exists for the listing
- [ ] `PrintifyFulfillmentProvider.createProviderOrder` emits the POSITIONED `print_areas` form —
      `{ [position]: [{ src: sourceImageUrl, x, y, scale, angle }] }` — when `item.placement` is
      present, and continues to emit today's simple URL form (`{ [position]: sourceImageUrl }`)
      when it is absent — this is the ~5-line provider change anticipated in the original
      emerging-need note, and preserves current (centered) behavior for every listing that hasn't
      used the tool, with zero risk of regressing them
- [ ] No other provider (Prodigi, Teemill) is touched by this story
- [ ] Buyer-facing opacity is unaffected — placement is a seller-side production detail, never
      surfaced to any buyer-facing payload
- [ ] `quoteShipping` is unaffected (shipping cost doesn't depend on placement) — only
      `createProviderOrder`'s line-item shape branches on `item.placement`

**TDD Notes:**
- Test file: `__tests__/mftf-17-printify/US-MFTF-17.9-printify-positioned-order.test.ts` —
  asserts the positioned array form is sent when `item.placement` is set, and the existing
  URL-string form when it is not (a regression pin protecting every already-shipped listing)
- Extend the fan-out test coverage (`fanout.ts` / MFTF-12 tests) to assert `toQuoteItem` attaches a
  saved placement for a Printify apparel item and omits it when none is saved
- **Still bound by the same `// UNVERIFIED` flag as US-MFTF-17.2:** whether Printify prefers `src`
  as a URL vs. an uploaded-image id is unconfirmed without a live order; this story does not
  resolve that — it only proves the positioned-vs-simple branching is correct against MSW.
  **This story cannot reach `Passed` until a live order (piggybacking on US-MFTF-17.3, or a
  dedicated live check if 17.3 has already closed by the time this ships) confirms the positioned
  form specifically reaches production correctly** — the existing 17.3 acceptance criteria only
  promised to validate whatever order shape existed when it ran, so a live check of the positioned
  form is called out here explicitly rather than assumed to be covered retroactively

---

### US-MFTF-17.10 — Placement Preview Spike: Prototype the Printify Mockup Call

_Tracked as a chore, not a TDD user story — output is a decision document, not shipped code, same
convention as US-MFTF-17.1. No tracker row (matching US-MFTF-17.1's precedent of chores living only
in the epic file, not `project-tracker.json`)._

**Scope:** Prototype creating a DRAFT (unpublished) Printify product for one curated blueprint with
a design placed via the positioned `print_areas` form, then fetch the generated mockup `images[]`
Printify returns, and judge their visual quality/latency against the composite approach already
shipping in US-MFTF-17.8's editing canvas. Document findings and a recommendation in
`/docs/printify-api-notes.md`'s Mockups section (currently `// UNVERIFIED` — "not verified, no
product exists yet").

**Investigate and document:**
- [ ] Whether a DRAFT product create + mockup fetch is fast enough to serve as an on-demand
      "generate preview" action (seconds, not a background job) or is only viable as an
      infrequent/manual refresh
- [ ] Whether the mockups reflect the exact positioned placement submitted, or only Printify's own
      auto-layout (i.e. does the mockup generator honor `x`/`y`/`scale`/`angle`, or only render the
      variant generically) — this is the crux of the decision, since a mockup that ignores the
      seller's placement is worse than useless here
- [ ] Cleanup cost: whether a draft product needs explicit deletion/archival in the seller's real
      Printify shop after generating a preview, and what happens if it's left behind (shop clutter,
      any billing implication)
- [ ] Rate-limit exposure: cost in API calls per preview generation against the 600/min global
      limit and any per-endpoint sub-limits (Open Q#7 in `printify-api-notes.md`)

**Deliverable:** An update to `/docs/printify-api-notes.md`'s Mockups section with a clear
recommendation — composite (ship nothing further beyond US-MFTF-17.8's editing canvas) or Printify
mockup (proceed to US-MFTF-17.11) — and the findings needed to write US-MFTF-17.11's acceptance
criteria at the same level of detail as this epic's other mode-dependent stories.

---

### US-MFTF-17.11 — Placement Confirmation Preview

**As a** seller,
**I want** a higher-fidelity preview of my confirmed placement after saving it,
**so that** I can judge the real-world result beyond the lightweight live-editing canvas.

_Acceptance criteria below are written at the outcome level pending US-MFTF-17.10's finding,
mirroring how US-MFTF-17.2 was scoped pending US-MFTF-17.1 before that spike resolved the sourcing
mode._

**Acceptance Criteria — mode-independent (apply regardless of US-MFTF-17.10's finding):**
- [ ] After confirming a placement (US-MFTF-17.8), the listing edit page shows a preview distinct
      from the live-editing canvas — generated on save, not on every drag frame
- [ ] Preview generation failure never blocks saving the placement itself (the confirmed
      `x`/`y`/`scale`/`angle` values persist regardless of whether a preview could be rendered)
- [ ] Buyer-facing pages are unaffected by this story — the preview is a seller-side tool, not a
      new buyer-facing image (whether to surface it to buyers is a separate, unscoped decision)

**Acceptance Criteria — if US-MFTF-17.10 recommends the composite approach:**
- [ ] The confirmation preview reuses US-MFTF-17.8's composite renderer at higher resolution/
      quality than the live-drag canvas (e.g. the full-resolution design over the full-resolution
      stock image, vs. a downscaled live-drag version), with no additional Printify API calls

**Acceptance Criteria — if US-MFTF-17.10 recommends the Printify mockup approach:**
- [ ] On save, a DRAFT Printify product is created with the confirmed positioned placement and its
      mockup `images[]` are fetched and shown; the draft product is cleaned up per US-MFTF-17.10's
      documented cleanup finding
- [ ] Preview regeneration (e.g. after adjusting placement again) creates a new draft rather than
      mutating a stale one, and rate-limit exposure stays within US-MFTF-17.10's documented budget

**TDD Notes:**
- Test file: `__tests__/mftf-17-printify/US-MFTF-17.11-placement-preview.test.ts` plus a
  mode-specific file once US-MFTF-17.10 resolves which branch applies
- MSW: stub whichever endpoint the chosen approach needs (none, for composite; draft-product-create
  + mockup-fetch, for the Printify-mockup approach) per US-MFTF-17.10's verified shapes
- **This story cannot be scoped in finer detail, and its mode-specific branch cannot be
  implemented, until US-MFTF-17.10 lands** — same dependency shape as US-MFTF-17.2 on US-MFTF-17.1

---

**Deferred follow-ups surfaced by this scoping session (not built in US-MFTF-17.7–17.11):**
- **Back printing.** Logged above under the front-vs-back decision — would need a second design-
  file upload slot, a second placement row (or a `position` column on
  `ApparelListingPrintifyPlacement`), and both `print_areas` keys populated at order time.
- **Per-variant placement precision.** The chosen per-listing granularity accepts minor print-area
  dimension drift across sizes; if that drift ever proves visually significant in practice,
  per-variant placement rows are the natural extension (schema already supports it by changing the
  unique key, not by a structural rewrite).
- **Prodigi apparel placement parity.** Prodigi apparel has the identical auto-fill gap this epic
  fixes for Printify. Not scoped here per the New-Provider Pattern (Printify-first); logged as a
  new Open Question in `project_description.md`.

---

### US-MFTF-17.12 through US-MFTF-17.14 — Printify Dual-Mode (add a REFERENCED lane alongside DESIGNED)

_**Proposed 2026-08-18 (`tdd-spec-session`); RATIFIED by both founders 2026-08-25** — it revises the
US-MFTF-17.1 spike's DESIGNED-only recommendation, so per this project's founder-ratified-decision
convention it needed both founders' sign-off before implementation. Both founders confirmed
2026-08-25 that Printify should support DESIGNED **and** REFERENCED listings to leverage both lanes;
implementation began the same day (US-MFTF-17.12 first)._

_**The realisation:** Printify's order endpoint accepts line items in **two** forms — an ad-hoc
DESIGNED form (`{ blueprint_id, print_provider_id, variant_id, print_areas: {…}, quantity }`, where
the design travels on the order — what US-MFTF-17.2/17.9 built) **and** a REFERENCED form
(`{ product_id, variant_id, quantity }`, pointing at a product already built in our own Printify
shop, which already carries its design, placement, and generated mockups). The US-MFTF-17.1 spike
correctly ruled out an **external** reference model (referencing a product built on *another* site,
like Teemill), but under-weighted that a product in **our own** shop is referenceable by
`product_id` — functionally the Teemill (MFTF-13) pattern with the shop being ours. This makes
Printify the first provider that can be offered in **either** sourcing mode, chosen per listing._

_**Why keep both** (rather than replacing DESIGNED with REFERENCED): the two lanes serve distinct
jobs, and the app is already mode-first (`SourcingMode` is per-listing; DESIGNED Prodigi/Printify
and REFERENCED Teemill already coexist behind one normalised read-shape, MFTF-6). **DESIGNED**
(US-MFTF-17.7–17.9, built + passing) is cheap breadth — drop a design onto any curated blank
without hand-building each product in Printify; scales to many designs/blanks. **REFERENCED** is
curated fidelity — real per-colour Printify-generated mockups and colour-accurate garment imagery,
at the cost of the founder authoring each product in Printify's dashboard. Founder-driven decisions
this session (pending ratification):_

- _**Keep US-MFTF-17.7–17.9.** The DESIGNED placement tool is built, passing, and is the DESIGNED
  lane — not dropped. (It is Printify-DESIGNED-specific; a future self-service DESIGNED path keeps
  using it.)_
- _**Nothing is live yet → clean cut.** No Printify listing exists in production, so adding the
  REFERENCED lane needs no migration, back-compat, or dual-running concern._
- _**Reuse MFTF-13 almost wholesale.** The REFERENCED schema already exists — `ApparelListing`'s
  `providerKey`/`providerProductRef`/`providerBasePrice`/`snapshotFetchedAt` and `ReferencedVariant`
  (colour+hex, size, orderable ref, stock, `mockupUrl`). Printify-referenced is composing the
  proven Teemill patterns (13.2 ingest, 13.3 new-listing flow, 13.4 re-sync) with a `product_id`
  order branch — not new architecture. This also realises the "if REFERENCED" acceptance criteria
  that were parked in US-MFTF-17.2 when the spike chose DESIGNED._
- _**Shared primitive with the DESIGNED preview.** REFERENCED ingest and the deferred DESIGNED
  save-time preview (US-MFTF-17.10 spike / 17.11) both rest on the same operation — "create/read a
  Printify product and read its generated `images[]` mockups." So shipping REFERENCED also hands
  17.11 its machinery; 17.11's composite-vs-mockup branch should reuse it rather than re-prototype._
- _**Sequencing by real need, not by "it's possible."** Scoped now, but with one seller and nothing
  live the deciding factor is launch imagery: REFERENCED jumps the queue only if colour-accurate
  real mockups are wanted for launch; otherwise seller lifestyle photos on the DESIGNED path
  suffice. Left `Not Started`, not urgent._
- _**Multi-seller / per-seller Printify keys → deferred Open Question** (logged in
  `project_description.md`), may never be built — it needs multiple non-founder sellers first.
  Noted here only because it reinforces REFERENCED: an external seller would connect their **own**
  Printify account (their key + shop) and we would reference their products, which fits the
  referenced lane cleanly and the single-shared-shop DESIGNED lane poorly._
- _**Material-standard gate unchanged.** Printify still exposes no structured fabric composition, so
  the gate stays manual founder curation (the founder builds the referenced product from a
  qualifying blank), the same as the DESIGNED lane._

_**Dependency:** US-MFTF-17.12 (ingest) blocks US-MFTF-17.13 (authoring) and US-MFTF-17.14
(order/re-sync). None are blocked by US-MFTF-17.3, but US-MFTF-17.14 cannot reach `Passed` until a
live referenced order confirms the `product_id` form reaches production (same live-confirmation
convention as US-MFTF-17.9, piggybacking US-MFTF-17.3 or a dedicated check)._

---

### US-MFTF-17.12 — Printify REFERENCED Ingest (cache a shop product by product_id)

**As a** platform,
**I want** to cache a Printify product built in our own shop as a referenced-listing snapshot,
**so that** a referenced Printify listing renders and orders through the same normalised
referenced pipeline Teemill already uses — with the product's real mockups and no design-at-order.

**Acceptance Criteria:**
- [ ] Extends the existing US-MFTF-13.1 REFERENCED schema **additively** — `providerKey = "printify"`,
      `ApparelListing.providerProductRef = <Printify product_id>` — with no new parallel model,
      exactly as Teemill reuses these fields. The per-variant orderable key is stored on
      `ReferencedVariant.variantRef` as the Printify **`variant_id`** (integer, as a string); the
      order path (US-MFTF-17.14) composes `{ product_id: providerProductRef, variant_id: Number(variantRef) }`.
      (Teemill's `variantRef` holds an absolute URL; the field's meaning generalises to "the
      provider's orderable variant key" — no migration.)
- [ ] A Printify product-ingest function (`GET /shops/{shop_id}/products/{id}.json`) caches, per
      orderable (colour, size): the `variant_id`, colour **name + hex** (Printify gives names; hex
      via `colorNameToHex`, or the product option's colour value if present), size, the **per-colour
      mockup** URL (from the product's `images[]` matched by `variant_ids`), stock/orderability, and
      base price (USD cents) — following the US-MFTF-13.2 ingest pattern and writing `ReferencedVariant`
      rows + `snapshotFetchedAt` + `providerBasePrice`.
- [ ] Live per-variant availability is re-checked at detail-build and checkout, **fail-open**,
      reusing the US-MFTF-17.4 / Teemill `isOrderable` pattern (a referenced Printify product's
      variants still carry live stock).
- [ ] Renders through the normalised read-shape with **zero buyer-facing change** — a referenced
      Printify listing is indistinguishable from a Teemill one to browse/detail (MFTF-6).
- [ ] Buyer-facing opacity is unconditional: no Printify name, `product_id`, `variant_id`, or
      blueprint id in any buyer-facing payload.

**TDD Notes:**
- Test file: `__tests__/mftf-17-printify/US-MFTF-17.12-printify-referenced-ingest.test.ts`.
- MSW: a `GET /shops/:shop/products/:id.json` fixture (variants with `options.color`/`options.size`,
  `images[]` carrying `src` + `variant_ids` + `is_default`, price, stock) added to `printifyHandlers`.
- Assert: `ReferencedVariant` rows cached per (colour,size) with the integer `variant_id` in
  `variantRef`, per-colour `mockupUrl` resolved from `images[]`, hex populated; buyer-opacity
  (no provider identity in the projection); fail-open on an availability-read error.
- Reaches `Passed` via MSW (the product-read shape can be live-verified read-only at any time, like
  US-MFTF-17.5); it does **not** gate on US-MFTF-17.3.

---

### US-MFTF-17.13 — "New referenced Printify listing" flow + the DESIGNED-vs-REFERENCED fork

**As a** founder curating apparel,
**I want** to paste a Printify product reference, preview it, and create a referenced listing —
choosing per listing whether Printify is used in DESIGNED or REFERENCED mode,
**so that** I can list a product I built (design + placement + mockups) in Printify's own dashboard.

**Acceptance Criteria:**
- [ ] The apparel-listing creation flow gains a **Printify mode fork**: when the provider is
      Printify, the creator chooses **DESIGNED** (upload a design onto a curated blank — the existing
      US-MFTF-5/17.2 flow) or **REFERENCED** (reference a product built in Printify). Prodigi
      (designed-only) and Teemill (referenced-only) show no fork — the fork is Printify-specific and
      must not branch buyer-facing code.
- [ ] The REFERENCED-Printify branch accepts a Printify **product URL or `product_id`** from our
      shop, a read-only **resolve/preview** action renders the product's mockups + variants
      (colours/sizes/stock/price) before create, and an outbound link + guidance point to Printify's
      product builder — mirroring the US-MFTF-13.3 "paste link → resolve → preview → ingest" UX.
- [ ] On submit, the US-MFTF-17.12 ingest runs and a referenced listing is created
      (`providerKey = "printify"`).
- [ ] Clear errors for an unknown/unpublished product, a product not in our shop, or an auth
      failure; the material-standard gate is unchanged (manual founder curation — the preview is a
      convenience, not auto-approval).

**TDD Notes:**
- Test files: `US-MFTF-17.13-resolve-printify-product.test.ts` (resolve/preview + create action,
  MSW, error + auth paths) and a jsdom `US-MFTF-17.13-printify-mode-fork.test.tsx` (the fork renders
  for Printify only; the referenced branch shows the URL field and previews mockups after look-up).
- Reuse the US-MFTF-13.3 referenced-form components/patterns where possible rather than a second
  implementation.

---

### US-MFTF-17.14 — Referenced Printify Order + Re-sync

**As a** platform,
**I want** to fulfil a referenced Printify listing by `product_id`/`variant_id` and keep its cached
snapshot fresh,
**so that** orders use the pre-built Printify product (with its design + mockups) and the referenced
data doesn't drift.

**Acceptance Criteria:**
- [ ] `PrintifyFulfillmentProvider.createProviderOrder` emits the **REFERENCED** line-item form
      `{ product_id, variant_id, quantity }` for a referenced-Printify item — `product_id` from
      `providerProductRef`, `variant_id` from the resolved `ReferencedVariant` — distinct from the
      DESIGNED `print_areas` branch (US-MFTF-17.9). The provider selects the branch by inspecting the
      item (the same way `toQuoteItem`/fan-out already forks designed vs referenced), and a
      **regression test pins that DESIGNED items still send `print_areas`**.
- [ ] The two-step create → `send-to-production` safety valve is unchanged (Manual/API shop).
- [ ] Re-sync/edit follows US-MFTF-13.4: provider-owned fields (colours/sizes/mockups/stock/price)
      are read-only, merchandising (title/description/retail/photos) is editable, and a
      "Re-sync from Printify" action re-runs the US-MFTF-17.12 ingest.
- [ ] No other provider is touched; buyer-facing opacity is unaffected.

**TDD Notes:**
- Test file: `__tests__/mftf-17-printify/US-MFTF-17.14-referenced-order-resync.test.ts` — asserts the
  `{ product_id, variant_id }` form is sent for a referenced item and the `print_areas` form for a
  designed item (the regression pin), plus a re-sync that refreshes the snapshot in place.
- **Cannot reach `Passed` until a live referenced order** confirms the `product_id` form reaches
  production correctly — same `// UNVERIFIED` live-confirmation class as US-MFTF-17.9, piggybacking
  US-MFTF-17.3 or a dedicated live check. Mark `Tests Passing — pending live confirmation` once green
  vs MSW.
