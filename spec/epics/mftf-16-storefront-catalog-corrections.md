## Epic MFTF-16: Storefront & Catalog Corrections

_Added 2026-06-18. Two small revisions correcting drift from the two-sourcing-mode model. Both touch Passed stories. Grouped as a standalone epic because they are unrelated to the fulfillment work in MFTF-14/15._

### US-MFTF-16.1 — Remove Teemill from Designed-Mode Provider Picker

**As an** admin,
**I want** the designed-mode product catalog to offer only Prodigi,
**so that** the UI reflects that Teemill is a referenced source and cannot be mis-selected into the designed path.

**Acceptance Criteria:**
- [ ] The `fulfillmentProvider` dropdown in the product-type create/edit form (US-MFTF-4.3) no longer offers Teemill; designed-mode product types are Prodigi-only
- [ ] The `ProductType.fulfillmentProvider` enum **retains** the `TEEMILL` value in the schema (no migration) — it is removed from the UI and blocked for new designed types, not deleted from the enum
- [ ] Attempting to create/update a designed `ProductType` with `TEEMILL` via the server action is rejected with a validation error (guards against direct/stale calls)
- [ ] Where the Teemill option previously appeared, an informational note **region renders** (asserted by test id or role, not by exact string) conveying that Teemill products meet the material standard, are available via the referenced-listing path, and can be added by reference without whitelisting a product type. The exact copy is founder-authored and is a non-asserted detail — tests assert the note region is present, not its wording
- [ ] Existing Passed MFTF-4 behavior for Prodigi designed types is unchanged

**TDD Notes:**
- Test file: `__tests__/mftf-16-storefront-corrections/US-MFTF-16.1-teemill-out-of-designed-picker.test.ts`
- Server-action test: create/update designed ProductType with TEEMILL → validation error
- Component test: provider dropdown contains Prodigi only; informational note renders
- Regression: existing Prodigi product-type create/edit still passes

### US-MFTF-16.2 — Default First Color on Apparel Detail Page

**As a** buyer,
**I want** the first available color pre-selected when I open an apparel product,
**so that** the page is immediately complete and I only need to choose a size.

**Acceptance Criteria:**
- [ ] On `/shop/[listingId]`, the first offered color is selected by default on initial render, for **both** sourcing modes (designed: first `ApparelListingColor`; referenced: first `ReferencedVariant` color)
- [ ] Size remains **not** pre-selected (this revises US-MFTF-6.2 for color only; size behavior is unchanged)
- [ ] The add-to-cart / buy button is disabled until a **size** is selected (color is already satisfied by the default) — this revises US-MFTF-6.2's "disabled until both a color and size are selected"
- [ ] In referenced mode, defaulting to the first color also selects that color's cached mockup on load (consistent with US-MFTF-6.2's referenced-mode mockup-swap criterion)
- [ ] If a listing has zero offered colors, the page degrades gracefully (no crash; buy disabled)

**TDD Notes:**
- Test file: `__tests__/mftf-16-storefront-corrections/US-MFTF-16.2-default-first-color.test.ts`
- Component tests: first color highlighted on mount (both modes); buy button gated on size only; referenced-mode mockup matches defaulted color
- Regression: update the US-MFTF-6.2 tests that asserted "no color pre-selected" / "both required"
