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
