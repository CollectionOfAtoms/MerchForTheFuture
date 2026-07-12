## Epic MFTF-19: Storefront Polish & Pricing Visibility

_A round of buyer- and seller-facing quality-of-life fixes that make the storefront look intentional and give the founders the cost visibility they need to curate the Teemill catalog: corrected media ordering, a dark-mode toggle, per-mockup backgrounds, a navigable admin tracker, and US-landed price capture/display for Teemill products. Independent of the launch-critical path; sequenced after Epic 5 (Tax) and before the Pre-Launch Checklist (MFTF-10)._

_**Definition of done:** Apparel detail carousels lead with lifestyle photos then mockups; a persisted, OS-aware dark mode is available site-wide; sellers can set a background color per apparel mockup; the admin tracker page is navigable by section and shows passed-dates; and founders can record and see a US-landed cost per Teemill product on both the admin catalog view and the seller picker._

### US-MFTF-19.1 — Lifestyle Photos Lead, Mockups Follow in Apparel Carousel

**As a** buyer,
**I want** an apparel listing's lifestyle photos shown first and its mockups after,
**so that** I see the real-world product before the flat mockups instead of one set hiding the other.

**Acceptance Criteria:**
- [ ] The apparel detail carousel renders **the union** of lifestyle photos and mockups — never one set to the exclusion of the other.
- [ ] Ordering is deterministic: all lifestyle photos first (in their stored order), then all mockups (in their stored order).
- [ ] A listing with mockups and **zero** lifestyle photos shows the mockups (current default preserved).
- [ ] A listing with **one or more** lifestyle photos shows lifestyle photos first, then the mockups appended after — adding a lifestyle photo no longer drops the mockups.
- [ ] The first carousel slide (initial/active) is the first lifestyle photo when one exists, else the first mockup.
- [ ] Behavior is identical for `DESIGNED` and `REFERENCED` listings; the carousel reads the normalized projection and does not branch on `sourcingMode` or provider.
- [ ] For `REFERENCED` (Teemill) listings, mockups are the per-colour `images[].src` from the cached snapshot; for `DESIGNED`, the existing mockup source. Both feed the same ordered media list.

**TDD Notes:**
- **Revises Passed US-MFTF-6.2** (apparel detail page): carousel assembly changes from "lifestyle-replaces-mockups" to "lifestyle-then-mockups union." Flag in handoff.
- Test the media-assembly selector directly (pure function over the normalized read-shape): cases = mockups-only, lifestyle-only, both, and ordering within each group.
- Component test asserting first active slide and full ordered sequence for a both-present fixture.
- No schema change. If a single ordered `media[]` projection doesn't already exist, this story introduces it as the carousel's input.

**Status:** Not Started

### US-MFTF-19.2 — Navigable Admin Project-Tracker Page with Passed Dates

**As an** admin,
**I want** the project-tracker page navigable by section and showing when each story passed,
**so that** I can find a story without endless scrolling and see its completion date.

**Acceptance Criteria:**
- [ ] The tracker page provides section navigation (jump list / sticky nav / collapsible sections) keyed by epic, letting the admin jump to or collapse any epic without scrolling the full list.
- [ ] Each story row displays its `testPassedDate` when present; rows without one show a clear empty state.
- [ ] Section navigation reflects all epics present in the tracker data (designed, referenced, original, BUG, CHORE) and updates as the data does — no hardcoded epic list.
- [ ] Per-epic status counts (Passed / Not Started / Deferred) are visible at the section level so the admin sees progress without expanding.
- [ ] The page remains accessible: nav is keyboard-operable and collapse controls expose expanded/collapsed state.
- [ ] Admin-gated (existing access control preserved).

**TDD Notes:**
- Reads the same tracker data already rendered; presentation/navigation only, not a data change.
- Test the grouping/counting transform (stories → epic-grouped sections with counts and passed-dates) as a pure function over tracker JSON.
- Component test for nav presence, collapse toggle state, and that a story row surfaces `testPassedDate` (and the empty state when null).
- Render passed-date even where `testPassedCommit` is the `"pending"` placeholder (Epic 5 stories) — do **not** gate the date on a real commit hash. CHORE-16 still owns backfilling those commits.

**Status:** Not Started

### US-MFTF-19.3 — Dark Mode Theme Tokens

**As a** visitor,
**I want** the site to render correctly in a dark theme,
**so that** I can browse comfortably at night without the bright palette straining my eyes.

**Acceptance Criteria:**
- [ ] A complete dark-theme token set is defined alongside the existing light tokens in `globals.css` (within `@theme inline {}`), covering background, surface, text, border, and the brand accent(s) — including a night-appropriate treatment of the current yellow accent.
- [ ] Theme is switched by a single root-level mechanism (e.g. a `data-theme`/`.dark` attribute on `<html>`), with all component colors resolving through tokens — no hard-coded hex outside the token definitions.
- [ ] Dark-mode contrast meets WCAG AA for body text and interactive controls.
- [ ] Watermarked imagery and product photos are unaffected (theme governs chrome, not media).
- [ ] No visual regression to the existing light theme (it remains the rendered default until 19.4's resolution runs).

**TDD Notes:**
- Tailwind v4, no config file — tokens are `--color-*` in `@theme inline {}` per the tech rationale. Verify the dark set registers as theme tokens, not loose CSS vars.
- This is the token/infrastructure story; the toggle + persistence is 19.4. Keep them separate so the toggle has a stable token surface to flip.
- Color assertions are weak in unit tests: a smoke test that the `.dark` root resolves a known token to its dark value, plus a manual-QA contrast checklist note. Flag any criterion that can't be auto-tested.

**Status:** Not Started

### US-MFTF-19.4 — Dark Mode Toggle with OS-Aware Persistence

**As a** visitor,
**I want** the site to follow my OS dark/light preference on first visit and remember my manual choice thereafter,
**so that** I get a comfortable default without configuration but can still override it.

**Acceptance Criteria:**
- [ ] On first visit with no stored preference, the active theme follows the OS setting (`prefers-color-scheme`).
- [ ] A visible toggle switches between light and dark; the choice persists across navigation and future visits.
- [ ] Preference persists via a mechanism readable during SSR so the correct theme renders on the **initial paint with no flash** of the wrong theme (App Router; cookie-based rather than localStorage-only for this reason).
- [ ] A persisted manual choice takes precedence over the OS setting on subsequent visits; OS preference only governs when no manual choice is stored.
- [ ] The toggle is keyboard-operable and exposes an accessible label and pressed/checked state.
- [ ] Works for both authenticated and guest users (no account required).

**TDD Notes:**
- Depends on 19.3 (tokens must exist to flip).
- The no-flash requirement is the tricky part: spec the resolution as reading the cookie server-side and setting the root attribute before hydration. Test the resolver's precedence logic (stored cookie > OS > light default) as a pure function.
- Component test: toggle click flips root attribute and writes the cookie; accessible name/role present.
- No DB persistence needed — cookie is sufficient and matches the guest-cart cookie pattern already in use.

**Status:** Not Started

### US-MFTF-19.5 — Founder Records US-Landed Cost per Teemill Product

**As a** founder,
**I want** to record a US-landed unit cost (USD) for each Teemill product,
**so that** I can capture what I learn about which garments are affordable to ship to US buyers and reuse it when curating listings.

**Acceptance Criteria:**
- [ ] A referenced (Teemill) listing/catalog entry can store a founder-entered **US-landed cost** as a USD value (nullable; null = not yet recorded).
- [ ] The value is editable by a founder (seller/admin) from the referenced-listing context; input validates as a non-negative currency amount.
- [ ] The field is independent of `providerBasePrice` (the cached GBP base) and of `retailPrice` — it is a curation/reference datum, not used in any checkout or pricing calculation.
- [ ] Editing and persistence are covered server-side (server action / route), with auth gating to seller/admin.
- [ ] The data model is shaped so an automated quoter could later populate the same field without migration (seam for deferred automation).

**TDD Notes:**
- **MVP is manual** (founder eyeballs the US cost). Automated `POST /orders` quoting is deferred — blocked by Teemill Open Q#3 (undocumented rate limits) and the still-`UNVERIFIED` question of whether an unconfirmed `POST /orders` expires/bills, plus the £0 bundled-shipping quirk that makes auto-quotes imperfect.
- New nullable field on the referenced-listing model (e.g. `ApparelListing.usLandedCost` as integer cents, USD). Schema change — flag in handoff; `prisma db push` to both DBs.
- Explicitly *not* wired into checkout, margin math, or the sticker. Test that it round-trips and never enters any pricing path.
- Auth mocked via `vi.mock()` per the testing convention.

**Status:** Not Started

### US-MFTF-19.6 — US-Pricing Signal on Admin Catalog View and Seller Picker

**As a** founder,
**I want** the recorded US-landed cost shown on both the admin Teemill catalog view and the seller listing-creation picker,
**so that** I can see at a glance which products are reasonably priced for US buyers before building a listing.

**Acceptance Criteria:**
- [ ] The admin Teemill catalog/audit view displays each product's recorded US-landed cost (USD), or a clear "not recorded" state when null.
- [ ] The seller listing-creation picker shows the same US-landed cost per referenced product (or "not recorded").
- [ ] Both the number **and** a display-only color band (green / amber / red) are shown; the band is derived from two **admin-configurable** thresholds and rendered as a badge. The band is presentational and recomputed from the stored number — no label state is persisted. Sellers see both the number and the band at a glance.
- [ ] Products with no recorded cost render a neutral "not recorded" badge, not a misleading band.
- [ ] Both surfaces read the same value from 19.5; there is no second source of truth.
- [ ] Sorting or visual grouping by US-landed cost is available on the admin view (so the founder can scan cheapest-first).

**TDD Notes:**
- Depends on 19.5.
- Thresholds stored as two config values (amber-above, red-above), not per-product state. Test band derivation as a pure function over `(cost, thresholds)`, including the null → "not recorded" case.
- Component tests for both surfaces asserting the rendered value and badge state for recorded / not-recorded / each band.
- Buyer-facing surfaces are untouched — founder/seller-only. Confirm no leak of cost data to buyer views.

**Status:** Not Started

### US-MFTF-19.7 — Seller Selects a Background Color per Apparel Mockup

**As a** seller,
**I want** to choose a background color for each transparent Teemill mockup from a set of swatches,
**so that** mockups display on an intentional backdrop instead of whatever the page background happens to be.

**Acceptance Criteria:**
- [ ] For referenced (Teemill) listings whose mockups arrive with transparent backgrounds, the seller can assign a background to **each mockup** from the swatches offered by the picker: white, black, and three greys between them.
- [ ] The selected background is **stored as a color value** (e.g. a hex string), not as a fixed enum of the five current choices — so additional colors (or, later, background images) can be introduced without a migration or disturbance to existing listings.
- [ ] The **picker** defines and offers the five current swatches; the **renderer** reads the stored color value and does not assume the five-swatch set — any stored value renders faithfully.
- [ ] A mockup with no stored background falls back to a defined default (e.g. white) at render time.
- [ ] The chosen background is composited **behind** the transparent mockup at render time on buyer-facing carousel/detail views and on the seller preview — the stored mockup image itself is never modified.
- [ ] The background applies wherever that mockup renders (detail carousel and any thumbnail derived from it).
- [ ] Selection is auth-gated to the listing's seller/admin and persists across sessions.

**TDD Notes:**
- Store the background as a nullable **string color value** per mockup (not a Prisma enum) — the deliberate open-ended seam the founder asked for. If Teemill mockups are currently held only as cached URLs on the referenced-variant snapshot, this story needs a small persisted structure to attach a per-mockup background; flag the shape decision in handoff (a `mockupBackgrounds` map keyed by mockup identity vs. a child row).
- Picker offers five swatches as a UI-layer constant; renderer must treat the stored value as opaque (render any valid color), so a later picker expansion needs no renderer change. Test explicitly: a stored value outside the current five still renders.
- Render-time compositing (CSS background behind the `<img>`), not a baked/flattened Blob — reversible, no upload pipeline.
- Distinct from Epic MFTF-PF's `PrintSizeMockup` (seller-*uploaded* print mockups); this is *background selection* on provider-served apparel mockups. Note so they aren't conflated.
- Test: default-when-unset; round-trip persistence; renderer honors an arbitrary stored color; picker→renderer share no enum coupling.

**Status:** Not Started
