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

### US-MFTF-17.7 — Seller Apparel Design/Placement Tool _(EMERGING — NEEDS SCOPING)_

**Status: Deferred / not yet scoped.** This is a placeholder recording an emerging need, raised by
the founder 2026-08-15. It is **not** ready for implementation — it must go through a dedicated
scoping session (`tdd-spec-session`) to produce real acceptance criteria first. Marked `Deferred`
(not `Not Started`) in the tracker so a coding session does not pick it up as ready work.

**The gap:** a seller uploads one design file (`ApparelListing.designImageUrl`) but has no control
over how it sits on the garment. At order time `PrintifyFulfillmentProvider.createProviderOrder`
hardcodes the placement to dead-centre, full-scale, **front only**
(`print_areas` placeholder `x:0.5, y:0.5, scale:1, angle:0`); Prodigi apparel similarly auto-fills.
No size/position/rotation/front-vs-back control — the analog of the print **framing** tool
(Epic MFTF-PF) does not exist for apparel.

**Why it's feasible (context for the scoping session):**
- Printify's `print_areas` API already takes `x/y/scale/angle` per position (front/back) — exactly a
  placement tool's output; we currently send only the centred defaults.
- Each variant's API data carries the print-area pixel dimensions (e.g. Baby Tee front 2419×2761),
  but `sync-printify` does **not** store the `placeholders` today — capturing them is the one
  missing data piece.
- Strong in-repo precedent to reuse: the MFTF-PF print framing/crop tool — `FramingTool.tsx`,
  `PrintFramingPanel.tsx`, the `PrintFraming` model, `src/lib/print/framing.ts` + `crop-geometry.ts`.

**Likely shape (to be confirmed when scoped):** capture print-area dims at sync → a seller placement
tool (drag/scale/rotate the design within the front/back print area, mirroring `FramingTool`) →
persist `{position, x, y, scale, angle}` per listing → send at order time instead of the hardcoded
centre (~5-line provider change) → a live preview.

**Key decisions for the scoping session:** (a) full freeform drag/scale/rotate vs. simpler
centre/fill/fit + size-slider presets; (b) front-only vs. front+back; (c) preview via our own
composite (design over the stock image) vs. Printify's mockup generator (create a **draft** product,
pull Printify's photorealistic mockups — best preview, least render work, extra product-create call).
Recommended pre-scoping spike: prototype the Printify mockup call for one blueprint to judge preview
quality, which drives decision (c).
