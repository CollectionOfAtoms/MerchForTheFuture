## Epic MFTF-PF: Print Framing, Canvas Wrap & Seller Mockups

_Seller-controlled print fidelity. Source art is rarely the exact aspect ratio of a print SKU, and stretched canvas has edge-wrap finishing — today both fall back to Prodigi defaults (`sizing: "fillPrintArea"`, no `wrap`) with no human in the loop. This epic gives sellers a per-aspect framing crop (canvas **and** paper), a canvas-only edge-wrap choice, and a per-size buyer-facing mockup, then sends the framed crop + wrap to Prodigi. Founder-ratified 2026-06-21 (decisions A–E + hard gate + strict backfill + seller-mockup model)._

_**Two distinct assets — do not conflate.** The **framing crop** (`PrintFraming.croppedUrl`, per **aspect ratio**) is the print-production file sent to Prodigi. The **seller mockup** (`PrintSizeMockup.mockupUrl`, per offered **size**) is the buyer-facing display image and is never sent to Prodigi. One 4:5 crop serves both 8×10 and 16×20, but each size still gets its own buyer mockup — the grain mismatch is intentional._

_**Decisions (2026-06-21):** (A) framing per **aspect ratio**; (B) wrap **seller-fixed**, default **`MirrorWrap`**, `ImageWrap` **excluded from the picker** (sizing behaves oddly) — enum keeps all four values, the constraint is UI + server guard; (C) framing applies to **canvas and paper**, wrap is **canvas-only** (`wrap` nullable); (D) keep **all aspect-matching sizes** (US-15.6 unchanged); (E) replacing source art **clears framing crops and alerts the seller** to redo them. **Hard gate:** a prints-enabled listing cannot go/stay `ACTIVE` unless every offered aspect is framed **and** every offered size has a mockup. **Strict backfill:** on the migration deploy, any `ACTIVE` prints-enabled listing missing either is flipped to `ARCHIVED` and flagged._

_**Touches Passed stories:** US-15.2 (extends the print-config surface — additive), US-15.4 (revises buyer preview source: Prodigi-generated → seller-uploaded), US-15.6 (unchanged — guardrail only), US-15.7 (revises the "canvas uses White wrap" cost-calc assumption to a `MirrorWrap` default), and the `prodigi.ts` order/quote paths (replaces hardcoded `fillPrintArea`/no-wrap). Each is flagged in its tracker note._

_**Project-description reconciliation (open):** `project_description.md` (Cart & Checkout Model) still says "the seller never 'sets up' a print" — already contradicted by US-15.2 and more so by this epic. A Mode-F update is recommended once this lands (tracked in the project-description Open Questions)._

### US-MFTF-PF.1 — Print Framing & Mockup Schema + Backfill

**As a** platform,
**I want** per-aspect framing rows (crop + optional canvas wrap) and per-size buyer mockups modeled alongside the artwork, with a strict one-time backfill,
**so that** every print's production crop and buyer display are explicit data rather than Prodigi defaults, and no pre-existing listing silently ships a blind crop.

**Acceptance Criteria:**
- [ ] `PrintFraming` model: `artworkId`, `aspectRatio` (normalized string, e.g. `"4:5"`), `wrap` (`CanvasWrap?`, nullable — non-null only for canvas aspects), `croppedUrl`, normalized `cropX/cropY/cropW/cropH` floats in `[0..1]`, `needsReframe` (Boolean, default `false`), timestamps, `@@unique([artworkId, aspectRatio])`
- [ ] `PrintSizeMockup` model: `artworkId`, `sizeSku`, `mockupUrl`, timestamps, `@@unique([artworkId, sizeSku])`
- [ ] `CanvasWrap` enum with all four values (`BLACK | IMAGE_WRAP | MIRROR_WRAP | WHITE`) — all modeled even though the picker (US-MFTF-PF.2) excludes `IMAGE_WRAP`, so re-allowing it later needs no migration
- [ ] Helpers: `getFramingForArtwork(artworkId)`, `upsertFraming(...)`, `getMockupsForArtwork(artworkId)`, `upsertSizeMockup(...)`, and a derived `getPrintReadiness(artworkId)` returning per-listing the offered aspects with/without a crop and offered sizes with/without a mockup (gate predicate consumed by US-MFTF-PF.4)
- [ ] **Strict backfill (one-time):** a migration/backfill routine flips any `ACTIVE` prints-enabled listing missing **either** a framing crop for any offered aspect **or** a mockup for any offered size to `ARCHIVED`, and sets `needsReframe` so the seller is told why on return
- [ ] Schema applied via `prisma db push` (both DBs); `resetDatabase()` updated to include both models in correct cascade order
- [ ] All existing US-15.x print tests pass unchanged except where explicitly revised by this epic

**TDD Notes:**
- Test file: `__tests__/print-framing/US-MFTF-PF.1-framing-mockup-schema.test.ts`
- **Touches Passed US-15.2** — re-run; assert the print-availability toggle/config round-trip is unchanged (additive schema only)
- Unit: round-trip a canvas `PrintFraming` (wrap non-null) and a paper one (wrap null); uniqueness on duplicate `[artworkId, aspectRatio]`; `PrintSizeMockup` uniqueness on `[artworkId, sizeSku]`
- Backfill (node): ACTIVE prints-enabled listing with N offered aspects and <N crops → `ARCHIVED` + `needsReframe`; ACTIVE with all crops but a missing size mockup → `ARCHIVED`; fully framed+mocked ACTIVE → untouched; prints-*disabled* listing → untouched regardless
- `getPrintReadiness` returns correct missing-aspect / missing-size sets for mixed canvas+paper offerings

---

### US-MFTF-PF.2 — Seller Wrap Selection (Canvas Aspects)

**As a** seller,
**I want** to choose the edge wrap for each canvas aspect I offer, defaulting to mirrored,
**so that** the physical sides of the canvas look intentional rather than guessed.

**Acceptance Criteria:**
- [ ] On the listing edit page, each offered **canvas** aspect shows a wrap picker; **paper** aspects show no wrap control
- [ ] The picker offers exactly `{ MirrorWrap, Black, White }`; `ImageWrap` is **not** offered
- [ ] Default selection is `MirrorWrap` when no value is stored
- [ ] A server action persists the choice to `PrintFraming.wrap` for that `[artworkId, aspectRatio]`
- [ ] The stored value validates against the allowed set server-side; a submitted `ImageWrap` or any out-of-set value is rejected with a clear error (defence in depth — the enum still contains `IMAGE_WRAP`, so the guard is application-layer)
- [ ] Wrap and crop persist independently (the gate in US-MFTF-PF.4 requires both)

**TDD Notes:**
- Test file: `__tests__/print-framing/US-MFTF-PF.2-seller-wrap-selection.test.ts`
- No interactive canvas — jsdom-testable
- Component: canvas aspect renders the 3-option picker with `MirrorWrap` pre-selected; paper aspect renders no wrap control; `ImageWrap` absent from options
- Action: persists allowed value; rejects `ImageWrap`/unknown server-side
- **Revises Passed US-15.7** — update its criterion asserting canvas SKUs use "White" for cost calc. Re-run the US-15.7 cost-estimate suite; if the static cost table keys on a fixed reference wrap, keep that internal but assert the seller-facing default is `MirrorWrap`, not "White"

---

### US-MFTF-PF.3 — Interactive Framing Tool (Canvas + Paper)

**As a** seller,
**I want** a draggable, resizable crop box locked to each offered print aspect, overlaid on my source art,
**so that** I control exactly how the art is framed onto the print and what reaches Prodigi.

**Acceptance Criteria:**
- [ ] For each offered aspect (canvas or paper), the seller can open a framing tool showing the source image with a crop rectangle **locked to that aspect ratio**
- [ ] The crop box is draggable and resizable, constrained so it cannot extend beyond the image bounds and cannot invert (min size enforced)
- [ ] "Confirm framing" posts the normalized rect `{x, y, w, h}` in `[0..1]`; the server crops the source via the existing Sharp pipeline (`src/lib/artworks/variants.ts`) to the exact aspect, stores the result in Blob, and writes `PrintFraming.croppedUrl` + the rect + clears `needsReframe` for that aspect
- [ ] Re-opening the tool for an already-framed aspect pre-loads the stored rect
- [ ] The produced crop's pixel aspect matches the target SKU aspect within rounding tolerance (so Prodigi `fill` vs `fit` is a non-issue on the face)

**TDD Notes:**
- Test file: `__tests__/print-framing/US-MFTF-PF.3-framing-tool.test.ts`
- **Split rendering from drag math** so geometry (aspect-lock, bounds clamping, rect↔pixel conversion) is unit-testable without a DOM
- Unit: aspect-lock holds under resize; bounds clamping rejects out-of-image rects; normalized↔pixel round-trip; produced crop aspect within tolerance
- Server: confirm-framing crops via Sharp, writes Blob, persists rect + `croppedUrl`, clears `needsReframe`
- Playwright spec for the drag/resize interaction (the only part not unit-coverable)

---

### US-MFTF-PF.4 — Publish/Activation Gate + Reframe Alerts

**As a** seller,
**I want** to be blocked from publishing a prints-enabled listing until every offered aspect is framed and every offered size has a mockup, and to be told when an art change invalidates my framing,
**so that** no print ever ships a blind Prodigi crop or a missing buyer preview.

**Acceptance Criteria:**
- [ ] A prints-enabled listing **cannot** transition to or remain `ACTIVE` unless, for every offered print aspect, a `PrintFraming.croppedUrl` exists with `needsReframe = false`, **and** for every offered size a `PrintSizeMockup.mockupUrl` exists (predicate from `getPrintReadiness`, US-MFTF-PF.1)
- [ ] Attempting to publish/activate while incomplete returns a clear, itemized error (which aspects need framing, which sizes need a mockup) — not a generic failure
- [ ] The listing edit page renders a banner/badge listing every aspect that is unframed or has `needsReframe = true`, and every size missing a mockup, with direct links to fix each
- [ ] When the seller **replaces the source art**, all `PrintFraming` rows for that artwork have their crops invalidated (`croppedUrl` cleared / row marked) and `needsReframe = true` set, and the banner immediately reflects that framing must be redone (Decision E)
- [ ] Disabling the print toggle removes the gate (a non-print listing is unaffected); re-enabling re-applies it
- [ ] Server-side enforcement is the single source of truth; the client banner is advisory only

**TDD Notes:**
- Test file: `__tests__/print-framing/US-MFTF-PF.4-publish-gate.test.ts`
- Action (node): activate with a missing crop → rejected + itemized reasons; activate with a missing size mockup → rejected; activate fully complete → succeeds; `needsReframe = true` on any offered aspect → blocked even though a `croppedUrl` exists
- Art-replace: replacing source art sets `needsReframe` + clears crops for all the artwork's framing rows; a previously-ACTIVE listing is forced out of active-eligible state until reframed
- Component: banner enumerates unframed aspects + missing-mockup sizes with fix links
- **Touches the listing status transition** used by US-15.2 / seller dashboard (`toggleApparelListingStatusAction` or the artwork equivalent) — re-run those suites; the gate is an added precondition, existing non-print transitions unchanged

---

### US-MFTF-PF.5 — Fan-Out Sends Wrap + Cropped Asset to Prodigi

**As a** platform,
**I want** print line items to send the seller's framed crop and (for canvas) the chosen wrap to Prodigi on both quote and order,
**so that** the physical product matches what the seller confirmed.

**Acceptance Criteria:**
- [ ] In `src/lib/fulfillment/providers/prodigi.ts`, `createProviderOrder` for a **canvas** line item sends the framed `croppedUrl` as the print asset and `attributes: { wrap }` using the stored `PrintFraming.wrap`
- [ ] For a **paper** line item, it sends the framed `croppedUrl` and **no** `wrap` attribute
- [ ] The hardcoded `sizing: "fillPrintArea"` is removed for framed items (an exact-aspect asset makes face sizing a non-issue); document the chosen `sizing` value sent, if any, in `docs/prodigi-api-notes.md`
- [ ] `quoteShipping` includes `wrap` for canvas line items (parity with the order body)
- [ ] **Defensive fallback:** if no `PrintFraming` row exists for a line item's aspect (should be unreachable for an `ACTIVE` listing post-gate), fall back to the original source image and, for canvas, `MirrorWrap` — and log it as an anomaly
- [ ] No change to non-print (apparel) fan-out paths

**TDD Notes:**
- Test file: `__tests__/print-framing/US-MFTF-PF.5-prodigi-fanout.test.ts`
- MSW: assert the **exact** Prodigi order body and quote body — canvas item carries `attributes.wrap` + the `croppedUrl`; paper item carries `croppedUrl` + no `wrap`; neither sends the old `fillPrintArea` for framed items
- Fallback: a synthetic line item with no framing row uses the original asset + `MirrorWrap` (canvas) and emits the anomaly log
- Re-run the existing Prodigi provider suite (US-MFTF-3.2 + any US-8.3 order tests) to confirm apparel/other paths are unchanged

---

### US-MFTF-PF.6 — Seller Per-Size Mockup Upload

**As a** seller,
**I want** to upload a buyer-facing mockup image for each print size I offer,
**so that** buyers see an accurate, intentional preview rather than an auto-generated one.

**Acceptance Criteria:**
- [ ] The listing edit page provides, for each offered print size, a mockup upload control
- [ ] Uploaded mockups are stored in Blob and written to `PrintSizeMockup.mockupUrl` keyed by `[artworkId, sizeSku]`
- [ ] Mockups are buyer-facing **display** assets and are **not** sent to Prodigi (distinct from the production `croppedUrl`); they are not run through the diagonal original-protection watermark (promotional previews, not the at-home-printable original — confirm watermark mode with the existing `variants.ts` corner/diagonal options, likely none or corner)
- [ ] Replacing a size's mockup overwrites the prior one; removing it clears the row and (per the US-MFTF-PF.4 gate) blocks activation until re-supplied
- [ ] Upload validates file type/size consistent with the existing image upload pipeline

**TDD Notes:**
- Test file: `__tests__/print-framing/US-MFTF-PF.6-seller-mockup-upload.test.ts`
- **Revises Passed US-15.4** — its buyer-preview source changes from Prodigi-generated to seller-uploaded; the order/checkout path in US-15.4 is unchanged
- Action: upload persists `PrintSizeMockup`; overwrite replaces; remove clears
- Confirm the chosen watermark behavior for mockups is explicit (likely none or corner, **not** the diagonal original-protection overlay)

---

### US-MFTF-PF.7 — Buyer Sees Per-Size Mockup on Print Purchase

**As a** buyer,
**I want** the print purchase section to show the seller's mockup for the size I select,
**so that** I see exactly what I'm ordering.

**Acceptance Criteria:**
- [ ] On the listing detail page print section, selecting a print size displays that size's `PrintSizeMockup.mockupUrl`
- [ ] The displayed mockup updates when the buyer changes the selected size
- [ ] If a mockup is somehow absent (unreachable for an `ACTIVE` listing post-gate), the section falls back to the listing's primary image rather than rendering a broken image — and this path is treated as defensive, not expected
- [ ] No Prodigi mockup API call is made for buyer display (the seller-uploaded asset is the source of truth)

**TDD Notes:**
- Test file: `__tests__/print-framing/US-MFTF-PF.7-buyer-mockup-display.test.ts`
- **Revises Passed US-15.4** (buyer-facing surface) — re-run its buyer-display assertions against the new source
- Component: size selection swaps the mockup; missing-mockup falls back to primary image; assert no Prodigi mockup-API fetch occurs on the buyer page
