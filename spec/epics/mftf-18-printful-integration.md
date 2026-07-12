## Epic MFTF-18: Printful Integration

_**Material-standard gate cleared 2026-07-11**, same verification pass as MFTF-17 — Printful's catalog has confirmed options meeting the material standard with specific styles identified. Follows the **identical three-phase shape and acceptance criteria as MFTF-17**: (1) API discovery spike documented in `/docs/printful-api-notes.md`, resolving `DESIGNED` vs. `REFERENCED` for Printful specifically (Printful's API may differ from Printify's — do not assume the same answer); (2) provider integration against whichever mode the spike resolves; (3) founder confirmation against a live order. Sequenced after MFTF-17: the Printify discovery findings (state management, webhook-vs-polling defaults, pricing-model fit) should be reused as a checklist for the Printful spike even though the two providers are evaluated independently — do not assume Printful matches Printify's answer on sourcing mode without checking._

_**Dependency:** Not blocked on MFTF-17 completing, but sequenced after it — the same founder bandwidth that scoped and will implement MFTF-17 is expected to carry Printful, and any reusable abstraction gaps MFTF-17 surfaces (e.g. a rate-limit or pricing-model mismatch not anticipated by the existing FulfillmentProvider base class) are cheaper to fix once before both providers than twice._

### US-MFTF-18.1 — Printful API Discovery Spike

_Tracked as a chore, not a TDD user story. Same structure as US-MFTF-17.1 — output is `/docs/printful-api-notes.md`, investigating the identical list of questions (product creation model / sourcing-mode determination, catalog access scoped to the confirmed qualifying styles, variant/stock shape, order submission flow, webhooks vs. polling, auth, pricing/currency fit, mockups) against Printful's API specifically._

**Deliverable:** `/docs/printful-api-notes.md` with a clear `DESIGNED`/`REFERENCED` recommendation and findings sufficient to write US-MFTF-18.2 at MFTF-13-level detail.

---

### US-MFTF-18.2 — Printful Provider Integration

**As a** platform,
**I want** Printful integrated as a fulfillment provider using whichever sourcing mode US-MFTF-18.1 determines,
**so that** sellers can list Printful-fulfilled apparel through the same normalized listing/cart/checkout core used by Prodigi, Teemill, and Printify.

**Acceptance Criteria:** Identical in shape to US-MFTF-17.2 — mode-independent criteria (abstract-base subclass, factory registration, scoped catalog to qualifying styles only, buyer-opacity, `checkFulfillmentStatus()`-based status detection defaulting to polling absent confirmed webhooks, USD-fixed pricing with cached provider cost for margin-monitoring only, correct multi-provider cart fan-out) plus mode-specific criteria (`DESIGNED`: MFTF-4/5-pattern curated catalog and seller color-curation; `REFERENCED`: MFTF-13-pattern schema extension, paste-a-reference seller flow, ingest/re-sync). Substitute "Printful" for "Printify" throughout; do not assume the sourcing mode matches MFTF-17 without US-MFTF-18.1 confirming it independently.

**TDD Notes:** Same structure as US-MFTF-17.2 — test file `__tests__/mftf-18-printful/US-MFTF-18.2-printful-provider.test.ts` plus mode-specific files once resolved; MSW stubs per `/docs/printful-api-notes.md`; cannot reach Passed until US-MFTF-18.3 succeeds.

---

### US-MFTF-18.3 — Founder Confirmation: Live Printful Order

**As a** founder,
**I want** to place and confirm one real order through the Printful integration before it goes live for buyers,
**so that** the integration is validated against Printful's actual API behavior.

**Acceptance Criteria:** Identical in shape to US-MFTF-17.3, substituting Printful — live founder-placed order, confirmed receipt matching product/color/size/reference, confirmed real status-change detection, any live/documented discrepancy logged to `/docs/printful-api-notes.md` with follow-up stories scoped separately, epic moves to Passed only after this story succeeds.

**TDD Notes:** Same as US-MFTF-17.3 — manual verification story, no automated test file; document outcome in `/docs/printful-api-notes.md`.
