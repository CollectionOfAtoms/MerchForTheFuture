## Epic MFTF-6: Apparel Product Page & Browse

_Buyer-facing storefront for apparel. Lifestyle photography is the primary visual. Color picker and size selector are the core interaction. Fine-art prints and apparel live in separate browse experiences; a catch-all browse page is deferred._

_**Dependency:** Requires MFTF-5 (designed-mode apparel listings) and MFTF-13 (referenced-mode apparel listings). The MFTF-2 / CHORE-17 Teemill spike is **resolved** (API key obtained 2026-06-10; catalog shape live-verified 2026-06-12, see `/docs/teemill-api-notes.md`), so size/colour/mockup UX is now fully specifiable. Browse and detail pages must render **both** sourcing modes via the normalized read-shape (offered colours+hex, sizes, retail price, images) and must not branch on provider. For referenced listings, images come from cached Teemill mockups when no lifestyle photos were uploaded (US-MFTF-13.3). The earlier "refine US-MFTF-6.3 after MFTF-8" note is retired — MFTF-8 is not a prerequisite (see the MFTF-8 epic note)._

### US-MFTF-6.1 — Apparel Browse Page

**As a** buyer,
**I want** to browse available apparel products,
**so that** I can discover what the store is selling.

**Acceptance Criteria:**
- [ ] A page at `/shop` (or `/apparel`) displays all active `ApparelListing` records in a grid layout
- [ ] Each tile shows: primary lifestyle photo (grid variant), product title, price, available color count ("Available in 3 colors")
- [ ] Sold-out or archived listings do not appear
- [ ] Tiles link to the apparel product detail page at `/shop/[listingId]`
- [ ] Page is server-rendered for SEO
- [ ] Pagination: maximum 24 listings per page
- [ ] Navigation includes a link to `/shop` visible to all users

**TDD Notes:**
- Test file: `__tests__/mftf-6-apparel-storefront/US-MFTF-6.1-apparel-browse.test.ts`
- Data query tests: `getApparelListings()` returns only ACTIVE listings, sorted by `createdAt` descending
- Component tests: tile renders primary photo, title, price, color count
- Auth guard: none — public page

---

### US-MFTF-6.2 — Apparel Product Detail Page

**As a** buyer,
**I want** to view a single apparel product with its lifestyle photos, color options, and size selector,
**so that** I can make a purchase decision.

**Acceptance Criteria:**
- [ ] Page at `/shop/[listingId]` displays: lifestyle photo carousel (all images for listing), product title, description, retail price, color picker (swatches for each offered color; selected color is highlighted), size selector (all active sizes for the product type shown as buttons; no size is pre-selected)
- [ ] Selecting a color does not change the photos (photos are not color-specific)
- [ ] A note beneath the color picker: "Colors shown are representative — exact shade may vary slightly by batch"
- [ ] Size selector shows all sizes for the product type; no size-specific stock management at this stage
- [ ] "Add to cart" or "Buy now" button is disabled until both a color and size are selected
- [ ] Page is server-rendered; color and size selection is client-side state
- [ ] The page renders identically for both sourcing modes by consuming the normalized read-shape: designed-mode colours come from `ApparelListingColor`→`ProductTypeColor`; referenced-mode colours come from distinct `ReferencedVariant` colours (name + hex). The page does not reference provider names or `sourcingMode` in buyer-facing output
- [ ] For referenced listings with no uploaded lifestyle photos, the carousel uses cached Teemill mockups (`ReferencedVariant.mockupUrl`); selecting a colour may swap to that colour's mockup (referenced mode only — designed-mode photos remain colour-independent)
- [ ] If listing is not found or not active, returns 404

**TDD Notes:**
- Test file: `__tests__/mftf-6-apparel-storefront/US-MFTF-6.2-apparel-detail-page.test.ts`
- Server render tests: `getApparelListingDetail()` returns listing with colors, sizes, and images
- Component tests: color swatch selection updates highlight state; buy button disabled until both color and size chosen; 404 on inactive listing
- Note: "Add to cart" wiring deferred to MFTF-7; this story covers the page and selection UI only

---

### US-MFTF-6.3 — Apparel Listing in Seller Dashboard

**As a** seller,
**I want** to see my apparel listings alongside my artwork listings in the seller dashboard,
**so that** I have a unified view of everything I'm selling.

**Acceptance Criteria:**
- [ ] The seller listings index (`/seller/listings`) includes apparel listings with a type badge ("Apparel") distinct from artwork listing badges
- [ ] Each apparel listing row shows: primary lifestyle photo thumbnail, title, product type name, price, status badge, and action buttons (edit, archive/activate)
- [ ] Apparel listings link to `/seller/apparel/[listingId]/edit` for editing
- [ ] Archive/activate toggle works for apparel listings (sets `status` to `ARCHIVED` or `ACTIVE`)
- [ ] Count summary at top of dashboard reflects apparel listings in totals

**TDD Notes:**
- Test file: `__tests__/mftf-6-apparel-storefront/US-MFTF-6.3-apparel-in-seller-dashboard.test.ts`
- Integration test: seed one artwork listing and one apparel listing, assert both appear in seller index with correct type badges
- Action tests: `toggleApparelListingStatusAction` validates ownership and status transition
