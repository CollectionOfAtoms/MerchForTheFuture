## Epic MFTF-24: Apparel Categories, Collections & Navigation

_Adds a merchandising layer over the apparel catalog: buyer-facing **categories** (Men's, Women's, Whatevs), admin-managed **collections** (seeded with "New" and "Our Favorites"), a page per category and per collection, a **path-aware breadcrumb** on the product detail page, and an **Apparel dropdown** in the primary navigation. Scoped 2026-08-17 (`tdd-spec-session`)._

_**Why this epic exists:** the storefront currently has exactly one apparel surface — `/shop`, an undifferentiated grid of every ACTIVE listing, newest first (`getApparelListings`, US-MFTF-6.1). There is no way to group listings, no way to merchandise a curated set, and no navigational context anywhere: a buyer who lands on `/shop/[listingId]` has no indication of where that product sits in the catalog or how to get back to a related set._

**Founder-ratified decisions (this session):**

- **Category membership is non-exclusive but a durable grouping is mandatory to go `ACTIVE`.** A listing may be in Men's, Women's, or both — but it may not go live in none. _Ratified 2026-08-17 after a first pass had made membership optional._

  **Why the rule is phrased as "durable grouping" and not "is in New":** the founder's first formulation was that a listing need only "fall into New." That cannot work as a gate. `New` is `AUTO_NEW` — membership is derived from recency — so **every** listing is in New at the moment it publishes, meaning the check would pass unconditionally and could never fail. Worse, New membership **decays**: roughly one window later the listing silently drops out, and *that* is the moment it becomes reachable only from `/shop` and Whatevs. A gate on New would therefore be satisfied precisely when it doesn't matter and silent precisely when it does.

  The gate is therefore on a **durable grouping**: at least one `MANUAL` category (Men's, Women's) **or** membership in a `MANUAL` collection. Two things deliberately do **not** count — **Whatevs**, because every listing is in it, so it expresses no choice; and **New**, for the decay reason above.
- **Whatevs is all apparel, on its own route.** Every ACTIVE listing appears there automatically with no assignment step. It gets its own page (`/shop/category/whatevs`) rather than aliasing `/shop`, per founder decision — the two routes render the same result set today. _Recorded so a future session doesn't "fix" the duplication without knowing it was deliberate; if `/shop` later becomes something else (a landing page, a mixed-media grid), the separation is what makes that possible._
- **"New" is automatic with admin overrides.** Membership is recency-derived (a founder-tunable window), plus explicitly pinned listings, minus explicitly excluded ones. "Our Favorites" is fully manual. This is why `Collection` carries a `kind` rather than every collection being a plain join table.
- **Breadcrumb default trail (no navigation context):** `Home → Whatevs → [first collection the listing belongs to, if any] → [listing title]`. _"First" is deterministic by `Collection.sortOrder`, not insertion order — see US-MFTF-24.6. The leading `Home` follows the existing convention already written into US-MFTF-22.3 ("Home → Shop → [Product Title]"); strike it there and here together if it's unwanted._
- **Category assignment is seller-facing; collection curation is admin-only.** Categories describe the product, so they live on the listing form the seller already uses. Collections are merchandising, which the founder asked for as an admin capability.

_**Route scheme:** category pages live at `/shop/category/[slug]` and collection pages at `/shop/collections/[slug]`. **This is not cosmetic** — a flatter scheme like `/shop/mens` would collide with the existing `/shop/[listingId]` dynamic segment (Next.js would match `mens` as a `listingId`), so the extra static segment is load-bearing._

_**Dependency:** Builds on `ApparelListing` (US-MFTF-5.1 / US-MFTF-13.1) and the existing `getApparelListings` browse projection (US-MFTF-6.1), which category and collection pages reuse rather than reimplement. **Revises US-MFTF-22.3** (SEO): that story specifies a fixed `Home → Shop → [Product]` `BreadcrumbList`, which US-MFTF-24.6 supersedes — MFTF-24 must therefore be sequenced **before** MFTF-22 so the JSON-LD is written once, against the final model. No dependency on any fulfillment epic; can be built in parallel with anything in the sequence._

---

### US-MFTF-24.1 — Category & Collection Schema

**As a** platform,
**I want** models for apparel categories and admin-curated collections, seeded with the founder's defaults,
**so that** listings can be grouped and merchandised without a schema change per new grouping.

**Acceptance Criteria:**
- [ ] `Category` model: `id`, `slug` (unique), `title`, `description` (nullable), `kind` (enum `CategoryKind`: `MANUAL | ALL_APPAREL`), `sortOrder` (Int), `isActive` (Boolean, default true), `createdAt`, `updatedAt`
- [ ] `ApparelListingCategory` join model: `id`, `apparelListingId`, `categoryId`, unique on `[apparelListingId, categoryId]`, cascade-delete on listing removal — many-to-many, since a listing may be in both Men's and Women's
- [ ] Seeded categories: **Men's** (`mens`, `MANUAL`, sortOrder 0), **Women's** (`womens`, `MANUAL`, sortOrder 1), **Whatevs** (`whatevs`, `ALL_APPAREL`, sortOrder 2)
- [ ] A `ALL_APPAREL` category has **no** join rows — its membership is derived (every ACTIVE listing). Writing an `ApparelListingCategory` row pointing at an `ALL_APPAREL` category is rejected at the application layer with a clear error, so the two membership mechanisms can never disagree
- [ ] `Collection` model: `id`, `slug` (unique), `title`, `description` (nullable), `kind` (enum `CollectionKind`: `MANUAL | AUTO_NEW`), `isActive` (Boolean, default true), `sortOrder` (Int), `createdAt`, `updatedAt`
- [ ] `CollectionListing` join model: `id`, `collectionId`, `apparelListingId`, `sortOrder` (Int), `override` (nullable enum `CollectionOverride`: `PIN | EXCLUDE`), unique on `[collectionId, apparelListingId]`, cascade-delete on listing removal
- [ ] Seeded collections: **New** (`new`, `AUTO_NEW`, sortOrder 0), **Our Favorites** (`our-favorites`, `MANUAL`, sortOrder 1)
- [ ] Membership resolution is a single shared function, not duplicated per page: for a `MANUAL` collection, members are its `CollectionListing` rows (an `EXCLUDE` override on a `MANUAL` collection is meaningless and rejected at the application layer); for `AUTO_NEW`, members are (ACTIVE listings created within the recency window) ∪ (rows with `override: PIN`) − (rows with `override: EXCLUDE`)
- [ ] The `AUTO_NEW` recency window is a single named, founder-tunable constant (e.g. `NEW_COLLECTION_WINDOW_DAYS`), not a magic number repeated at call sites
- [ ] Every membership read returns only `status: ACTIVE` listings — an archived listing never surfaces on a category or collection page even if a join row still points at it (the join row is retained, so re-activating a listing restores its grouping without re-curation)
- [ ] A shared predicate `hasDurableGrouping(listingId)` (and a plural/batch form for list views) returns true when a listing has at least one `MANUAL` category assignment **or** one `MANUAL` collection membership. It deliberately ignores the `ALL_APPAREL` category and the `AUTO_NEW` collection — see the epic's gate decision above. This is the single definition consumed by the US-MFTF-24.5 activation gate and the US-MFTF-24.3 admin warning; neither reimplements the rule
- [ ] Schema applied via `prisma db push` (per this project's schema-drift convention, not `migrate dev`)

**TDD Notes:**
- Test file: `__tests__/mftf-24-categories-collections/US-MFTF-24.1-category-collection-schema.test.ts`
- Integration tests: create a listing in both Men's and Women's, query back both ways; assert cascade delete removes join rows
- Unit tests on the shared membership resolver: `MANUAL` returns exactly its rows; `AUTO_NEW` includes an in-window listing, includes an out-of-window `PIN`, excludes an in-window `EXCLUDE`, and excludes an ARCHIVED listing in every case
- Guard tests: writing an `ApparelListingCategory` row for the `ALL_APPAREL` category is rejected; an `EXCLUDE` override on a `MANUAL` collection is rejected
- `hasDurableGrouping` tests, one per branch — these are the load-bearing ones for the activation gate: true for a listing in Men's only; true for a listing in a `MANUAL` collection only; **false for a listing whose only membership is Whatevs**; **false for a listing whose only membership is `New`** (the specific case the founder's first formulation would have let through — assert it explicitly so a later refactor can't quietly re-admit it); false for a listing with no memberships at all
- Seed test: fresh `resetDatabase()` + seed produces exactly the three categories and two collections above, with the specified slugs and `kind` values
- Follow the existing `resetDatabase()` cascade-order convention so the two new join tables don't leak state between test files

---

### US-MFTF-24.2 — Category Pages

**As a** buyer,
**I want** a page per category showing the apparel in it,
**so that** I can browse just the products relevant to me instead of the whole catalog.

**Acceptance Criteria:**
- [ ] A page at `/shop/category/[slug]` renders the category's title, optional description, and a grid of its ACTIVE listings
- [ ] The grid reuses the existing `ApparelCard` projection and tile component from US-MFTF-6.1 — same tile shape, same image fallback behavior, same buyer-facing opacity (no provider names, no `sourcingMode`) — rather than a parallel second card implementation
- [ ] `MANUAL` categories (Men's, Women's) list listings joined through `ApparelListingCategory`; the `ALL_APPAREL` category (Whatevs) lists every ACTIVE apparel listing, derived — both paths go through the shared resolver from US-MFTF-24.1
- [ ] Pagination matches the existing storefront: maximum 24 per page, newest first, same page-param convention as `/shop`
- [ ] An unknown, inactive, or misspelled slug returns 404 (not an empty grid, which would read as "we have nothing" rather than "this page doesn't exist")
- [ ] A valid category with no listings renders an explicit empty state, distinct from the 404 above
- [ ] Tiles link to `/shop/[listingId]` carrying the navigation context the breadcrumb consumes (US-MFTF-24.6)
- [ ] Page is server-rendered

**TDD Notes:**
- Test file: `__tests__/mftf-24-categories-collections/US-MFTF-24.2-category-pages.test.ts` plus a jsdom `US-MFTF-24.2-category-page-view.test.tsx`
- Data tests: a listing in Men's appears on the Men's page and not on Women's; a listing in both appears on both; an uncategorized listing appears on Whatevs only; an ARCHIVED listing appears nowhere
- Route tests: unknown slug → 404; inactive category → 404; valid-but-empty category → empty state, not 404
- Pagination test: 25 listings in one category produce two pages with 24 on the first
- Regression: `/shop` itself is unchanged by this story — re-run the US-MFTF-6.1 browse tests

---

### US-MFTF-24.3 — Admin Collection Management

**As an** admin,
**I want** to create and manage collections and choose which listings are in them,
**so that** I can merchandise sets of products without a code change.

**Acceptance Criteria:**
- [ ] An admin page at `/admin/collections` lists all collections with their title, slug, `kind`, active state, and current member count
- [ ] Admins can create a collection (title, slug, optional description, sortOrder), edit it, and toggle `isActive`; slug uniqueness is validated with a clear error rather than surfacing a raw database constraint violation
- [ ] Admins can add and remove listings on a `MANUAL` collection, and reorder members within it (`CollectionListing.sortOrder`)
- [ ] For the `AUTO_NEW` collection, the UI presents **pin** and **exclude** actions rather than add/remove, and visibly distinguishes the three states (auto-included by recency, pinned, excluded) so it's never ambiguous why a listing is or isn't in "New"
- [ ] The seeded `New` and `Our Favorites` collections cannot be deleted (they are referenced by the navigation and the breadcrumb default trail); they can be renamed, reordered, and deactivated. Deletion of a non-seeded collection removes its join rows but never its listings
- [ ] Every action is admin-guarded: non-admin and unauthenticated callers receive `{ error: 'Unauthorized' }`, matching the existing server-action convention
- [ ] Changing a collection's membership is reflected on its public page without a redeploy (standard Next.js revalidation is acceptable)
- [ ] **Last-grouping warning:** deleting a collection, deactivating it, or removing a listing from it warns the admin when the action would leave one or more **ACTIVE** listings with no durable grouping (`hasDurableGrouping` → false, US-MFTF-24.1), naming the count and the affected listings before the action proceeds. _This closes the one gap a publish-time-only gate leaves: US-MFTF-24.5 stops a listing going live ungrouped, but cannot stop a live listing from losing its last grouping later. The warning is advisory — it does not block the admin, who may have a good reason — but the consequence is never invisible._

  _The same consideration applies to deactivating a **category** in whatever surface manages categories; if category administration ships in this epic it carries the identical warning, and if it remains seed-only for now, note that deactivating a seeded category is currently a database-level operation and the founders should re-check affected listings by hand._

**TDD Notes:**
- Test file: `__tests__/mftf-24-categories-collections/US-MFTF-24.3-admin-collections.test.ts` plus a jsdom `US-MFTF-24.3-admin-collections-form.test.tsx`
- Action tests: create/edit/deactivate round-trip; duplicate slug rejected with a readable message; delete of a seeded collection rejected; delete of a custom collection removes join rows and leaves the listings intact
- Auth tests: each action rejects a non-admin caller (seller and buyer both, not just anonymous — the seller role is architecturally distinct here)
- `AUTO_NEW` tests: pinning an out-of-window listing adds it; excluding an in-window listing removes it; neither action affects a `MANUAL` collection's resolution
- Last-grouping warning tests: removing a listing whose only grouping is this collection warns and names it; removing a listing that also has a category does not warn; an ARCHIVED listing losing its last grouping does not warn (the gate only concerns live listings); the warning is advisory — asserting the action still completes when confirmed
- Component test: the New collection's editor renders pin/exclude affordances and the three-state distinction, not add/remove

---

### US-MFTF-24.4 — Collection Pages

**As a** buyer,
**I want** a page per collection,
**so that** I can browse a curated set like "New" or "Our Favorites".

**Acceptance Criteria:**
- [ ] A page at `/shop/collections/[slug]` renders the collection's title, optional description, and its member listings, reusing the same tile component and pagination behavior as US-MFTF-24.2
- [ ] `MANUAL` collections order members by `CollectionListing.sortOrder` (the admin's curated order from US-MFTF-24.3); `AUTO_NEW` orders by `createdAt` descending, with pinned listings first
- [ ] An index page at `/shop/collections` lists all active collections with their title and member count, linking to each
- [ ] Unknown, inactive, or misspelled slug → 404; valid-but-empty collection → explicit empty state (same distinction as US-MFTF-24.2)
- [ ] Tiles link to `/shop/[listingId]` carrying the collection as navigation context for the breadcrumb (US-MFTF-24.6)
- [ ] Inactive collections are absent from both the index and the navigation dropdown, and their own page 404s — one visibility rule, applied everywhere, not three separate checks that could drift

**TDD Notes:**
- Test file: `__tests__/mftf-24-categories-collections/US-MFTF-24.4-collection-pages.test.ts`
- Ordering tests: a `MANUAL` collection renders in curated `sortOrder`; `AUTO_NEW` renders newest-first with a pinned out-of-window listing appearing first
- Visibility test: deactivating a collection removes it from the index AND the nav dropdown AND 404s its page — assert all three in one test so the "one rule" criterion is actually pinned
- Reuse test: assert the collection page and category page render the same tile component (guards against a divergent second card implementation)

---

### US-MFTF-24.5 — Seller Category Assignment & Activation Gate

**As a** seller,
**I want** to choose which categories my listing belongs to, and to be stopped from publishing one that would be findable nowhere,
**so that** every live product is reachable from somewhere a buyer actually browses.

**Acceptance Criteria:**
- [ ] The apparel listing creation form (`NewApparelListingForm`) and the edit form (`EditApparelListingForm`) both present the `MANUAL` categories (Men's, Women's) as a multi-select; the `ALL_APPAREL` category (Whatevs) is **not** offered as a choice — it is automatic, and offering it would imply it could be declined
- [ ] Both sourcing modes are supported: the referenced-listing forms (`NewReferencedListingForm` / `EditReferencedListingForm`, US-MFTF-13.3/13.4) get the same multi-select — categorization is a merchandising concern and must not branch on `sourcingMode`
- [ ] The create and update server actions persist the selection as `ApparelListingCategory` rows, replacing prior selections on edit (a category removed in the form is removed in the database)
- [ ] **Activation gate:** a listing cannot be created as `ACTIVE`, nor transitioned to `ACTIVE`, unless `hasDurableGrouping` (US-MFTF-24.1) is true. The gate is enforced **server-side in the action**, not only by disabling a button — a directly-posted payload is rejected identically
- [ ] Saving as a **draft** (`ARCHIVED`) with no grouping is always permitted — the gate is on going live, not on saving work in progress. This mirrors the Epic MFTF-PF publish-gate precedent (`ACTIVE` blocked until framing and mockups are complete; drafts unaffected)
- [ ] The blocked-publish message is **specific and actionable**, naming what's missing and how to satisfy it — e.g. "Pick at least one category (Men's or Women's), or add this listing to a collection, before publishing." — never a generic validation failure. It explicitly states that Whatevs and New don't satisfy the requirement, since a seller can plainly see the listing is in both and would otherwise read the block as a bug
- [ ] The publish control is disabled with the same explanation while the requirement is unmet, so the block is visible **before** the seller fills out the whole form and submits, not only after
- [ ] Transitioning an already-`ACTIVE` listing to `ARCHIVED` is never blocked (the gate is one-directional — it constrains going live, not coming down)
- [ ] Ownership is enforced: a seller can only set categories on their own listing; a non-owner receives `{ error: 'Unauthorized' }`
- [ ] An inactive category is not offered in the form, and an existing assignment to a now-inactive category is preserved in the database (not silently deleted) while simply not rendering anywhere buyer-facing. **An assignment to an inactive category does not satisfy the gate** — `hasDurableGrouping` counts only active groupings, so deactivating a category cannot leave a listing live-but-unreachable
- [ ] **Existing ACTIVE listings are not auto-archived** by this story. A one-time check logs any live listing lacking a durable grouping for the founders to fix, and the gate applies on that listing's next status transition or save. _This is a deliberate divergence from Epic MFTF-PF's strict archive-on-deploy backfill, and the reason is that the two failures differ in kind: an unframed print produces a physically defective product, whereas an uncategorized listing merely sells while being harder to find. Archiving live, saleable stock over a discoverability gap would be disproportionate. The catalog is also pre-launch and small enough that a report is sufficient._

**TDD Notes:**
- Test file: `__tests__/mftf-24-categories-collections/US-MFTF-24.5-seller-category-assignment.test.ts` plus a jsdom `US-MFTF-24.5-category-selector.test.tsx`
- Action tests: create with two categories persists two rows; edit removing one leaves exactly one
- **Gate tests (the core of this story):** publishing with no grouping is rejected; publishing with Men's only succeeds; publishing with a `MANUAL` collection membership but no category succeeds; **publishing with only Whatevs + New is rejected** (the founder's original formulation — pinned by an explicit test so it can't regress); saving as a draft with no grouping succeeds; archiving an ACTIVE listing is never blocked
- Server-side enforcement test: a directly-posted `ACTIVE` payload bypassing the disabled button is rejected with the same error — the gate is not UI-only
- Inactive-category test: a listing whose only category is then deactivated cannot be re-activated, and does not count as grouped
- Guard tests: non-owner rejected; Whatevs is never offered in the form's options and is rejected if injected into the submitted payload directly (a form-tampering path, not just a UI absence)
- Both-modes test: a referenced listing accepts category assignment and is gated identically to a designed one
- Regression: re-run the US-MFTF-5.3/5.4 and US-MFTF-13.3/13.4 form tests — the existing fields and validation must be otherwise unchanged, and the previously-passing "publish a listing" happy paths must be updated to assign a category rather than being deleted (a publish test that no longer publishes is a silently weakened test)

---

### US-MFTF-24.6 — Path-Aware Breadcrumb on the Product Page

**As a** buyer,
**I want** the product page to show the path I took to reach it,
**so that** I can see where this product sits and get back to the set I was browsing.

_**Revises US-MFTF-22.3 (Passed status not yet reached — SEO epic is `Not Started`).** That story specifies a fixed `Home → Shop → [Product Title]` `BreadcrumbList`. This story replaces the visible trail with a path-aware one and defines what the JSON-LD emits instead — see the last criterion._

**Acceptance Criteria:**
- [ ] Navigation context travels in the URL as a `from` query parameter (e.g. `/shop/[listingId]?from=category:mens`, `?from=collection:new`), set on every tile link from a category page (US-MFTF-24.2) and a collection page (US-MFTF-24.4). **URL-carried, not client state** — so the trail survives a refresh, is server-rendered, and is testable without simulating a browsing session
- [ ] The breadcrumb label is always resolved by looking the slug up in the database; the raw `from` value is **never** rendered as text. An unparseable, unknown, inactive, or mismatched `from` value silently falls back to the default trail rather than erroring or echoing user-supplied content
- [ ] A `from` value that references a real category or collection the listing is **not** actually a member of falls back to the default trail — the breadcrumb must never assert a false path, however it was reached
- [ ] With valid context, the trail is `Home → [category or collection title] → [listing title]`
- [ ] With no context, the default trail is `Home → Whatevs → [first collection the listing belongs to, if any] → [listing title]`; a listing in no collection yields `Home → Whatevs → [listing title]`
- [ ] "First collection" is deterministic: the active collection with the lowest `Collection.sortOrder` among those the listing belongs to (ties broken by slug, so the result is stable across requests and never depends on database row order)
- [ ] Every breadcrumb segment except the final one is a link; the final segment (the listing title) is plain text and marked current for assistive technology (`aria-current="page"`)
- [ ] The canonical URL for the page ignores the `from` parameter entirely — `/shop/[listingId]?from=category:mens` and `/shop/[listingId]` share one canonical URL, satisfying US-MFTF-22.2's "no query-string drift" requirement so the parameter cannot create duplicate-content signals
- [ ] The `BreadcrumbList` JSON-LD (US-MFTF-22.3) always emits the **default** trail, never the visitor-specific one — it must describe the canonical URL, which carries no `from` parameter. The visible breadcrumb varies by path; the structured data does not

**TDD Notes:**
- New pure module `src/lib/apparel/breadcrumb.ts` — `parseNavContext(from)` and `buildBreadcrumbTrail({ listing, context, collections })` returning a `{ label, href? }[]`. DOM-free and database-free (takes already-fetched data), so every branch below is a plain unit test
- Test file: `__tests__/mftf-24-categories-collections/US-MFTF-24.6-breadcrumb.test.ts`
- Parser tests: valid `category:mens` and `collection:new` parse; garbage, empty, wrong-prefix, and injection-shaped values (`<script>`, a raw URL) all return null rather than throwing
- Trail tests: valid context yields the context trail; absent context yields the default trail; a listing in no collection yields the 3-segment default; a listing in three collections picks the lowest `sortOrder`; a `from` naming a collection the listing isn't in falls back to default
- jsdom test: final segment is not a link and carries `aria-current="page"`; earlier segments are links with correct hrefs
- SEO-interaction tests: canonical URL is identical with and without `?from=`; JSON-LD emits the default trail even when `?from=` is present (this is the specific drift this story exists to prevent, so it gets its own assertion)

---

### US-MFTF-24.7 — Apparel Navigation Dropdown (Desktop & Mobile)

**As a** buyer,
**I want** an Apparel menu in the navigation that reveals the categories and collections,
**so that** I can jump straight to the group I care about instead of scrolling the whole catalog.

**Acceptance Criteria:**
- [ ] The primary desktop navigation gains an **Apparel** item that reveals a dropdown containing, in order: **New**, **Men's**, **Women's**, **Whatevs**, then the remaining active collections
- [ ] The dropdown opens on hover **and** on keyboard focus/activation — hover alone is not sufficient, since it is unreachable by keyboard and assistive technology. It closes on `Escape` (returning focus to the trigger) and on outside click, and sets `aria-expanded` on the trigger with `role="menu"` on the panel — matching the interaction contract already established by `NavDropdown` (Epic 23) rather than inventing a second pattern
- [ ] A brief close delay (or a bridged hover target) prevents the menu from vanishing when the pointer travels diagonally from the trigger to the panel — the standard hover-menu failure mode
- [ ] The Apparel trigger itself is a link to `/shop`, so the menu is not the only way to reach the storefront
- [ ] Collections are listed individually in the dropdown up to a cap (e.g. 6); beyond the cap, a "See all collections" item links to `/shop/collections`. The cap is a named constant, and the "see all" item also appears whenever any collection is hidden by it
- [ ] The dropdown is driven by live data — deactivating a collection (US-MFTF-24.3) removes it from the menu without a code change; category and collection titles come from the database, not hardcoded strings
- [ ] `MobileMenu` gains an equivalent **expandable** Apparel section with the same items — hover does not exist on touch, so it is tap-to-expand, consistent with the existing mobile menu's interaction style
- [ ] The existing top-level nav items (`Discover`, `Shop`, `Browse`, `Auctions`, `Prints`) and the account `NavDropdown` are unchanged by this story

**TDD Notes:**
- Test file (jsdom): `__tests__/mftf-24-categories-collections/US-MFTF-24.7-apparel-nav-dropdown.test.tsx`
- Interaction tests: opens on hover; opens on keyboard focus/Enter; `Escape` closes and returns focus to the trigger; outside click closes; `aria-expanded` flips correctly
- Data tests: menu renders seeded categories and collections from the database; a deactivated collection disappears; with 8 active collections, exactly 6 render plus a "See all collections" link
- Mobile test: `MobileMenu` renders the Apparel section collapsed and expands on tap, exposing the same destinations
- Regression: existing `NavDropdown` (Epic 23) and `MobileMenu` tests stay green — the account menu and existing links are untouched
- Note: the trigger is both a link (`/shop`) and a menu trigger; assert a click navigates while keyboard activation opens the menu, so the dual role is pinned by test rather than left to implementation taste

---

**Deferred follow-ups surfaced by this scoping session (not built in MFTF-24):**
- **A standing "uncategorized listings" surface.** The activation gate (US-MFTF-24.5) plus the last-grouping warning (US-MFTF-24.3) cover the two ways a listing can end up ungrouped, but neither is a persistent view. A badge in the seller listings index and an admin count — "N live listings aren't in any category or collection" — would make orphans continuously visible rather than only caught at the moment of the action. Considered and set aside this session as unnecessary at a ~10-design catalog; the natural addition if the catalog grows.
- **Nested / hierarchical categories.** Categories are a flat set. Sub-categories (e.g. Men's → Tees) would need a self-referential parent on `Category` and a deeper breadcrumb trail; not needed at a ~10-design catalog size.
- **Category and collection pages for fine-art prints/originals.** This epic is apparel-only. The `/browse` fine-art surface keeps its existing filtering; whether prints get the same treatment is unscoped.
- **Category/collection metadata and sitemap inclusion.** The new routes will need titles, descriptions, and sitemap entries — this belongs in MFTF-22 (SEO), which is sequenced after this epic; US-MFTF-22.1's static-route list and US-MFTF-22.2's per-page metadata should both be extended to cover them when that epic is worked.
