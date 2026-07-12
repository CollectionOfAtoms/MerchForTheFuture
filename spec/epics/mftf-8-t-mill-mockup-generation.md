## Epic MFTF-8: T-Mill Mockup Generation

_**Status: Deferred** (unchanged). **Rationale updated 2026-06-12 after live API verification:** this epic is now largely **moot for Teemill**. The Orders `/catalog/products` response already returns rendered per-colour mockups (`product.images[]` and `variant.images[]` on `images.podos.io`, linked to variants by `variantIds`), which the referenced-listing ingest caches as `ReferencedVariant.mockupUrl` (US-MFTF-13.1/13.2). There is nothing to "generate" for Teemill products — we read served mockup URLs. Prodigi (designed mode) supplies its own mockups. The original premise of this epic (composite a mockup from a design + placement coordinates, or call a Teemill mockup endpoint) is therefore unnecessary on both paths and the stories are not being scheduled._

_The one residual question this epic still gestures at — for **designed-mode (Prodigi)** listings, whether to ingest and display Prodigi's own mockups, and whether that is automatic or seller-curated (the old US-MFTF-8.2 "accept/discard") — is a live UX question for the Prodigi path only. It is captured as a deferred Open Question in `project_description.md` rather than scoped here. The stub stories below are retained for history; do not implement as written._

_**Dependency:** None remaining — the MFTF-2 / CHORE-17 spike that originally blocked this epic is resolved. Deferral is now a product-priority decision, not a blocked-on-spike decision._

### US-MFTF-8.1 — Generate Mockup Images During Listing Setup _(stub)_

**As a** seller setting up a new apparel listing,
**I want** to generate a T-Mill photorealistic mockup of my design on the product,
**so that** I have something to show buyers before physical QA samples are available.

_Original premise (generate a Teemill mockup from a design) is moot: Teemill serves per-colour mockups via the catalog API, cached at ingest by US-MFTF-13.2. Retained for history only._

**Status:** Deferred — not blocked (spike resolved); superseded for Teemill by US-MFTF-13.2 mockup caching

---

### US-MFTF-8.2 — Seller Accepts or Discards Mockups _(stub)_

**As a** seller,
**I want** to review generated mockups and choose which ones to include in my listing,
**so that** I have control over what buyers see.

_The residual "accept/discard mockups" idea survives only for the designed-mode (Prodigi) path and is captured as a deferred Open Question in `project_description.md`, not scoped here. Retained for history only._

**Status:** Deferred — not blocked (spike resolved); residual Prodigi-only concern moved to Open Questions
