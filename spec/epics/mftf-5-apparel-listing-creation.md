## Epic MFTF-5: Apparel Listing Creation

_Seller-facing listing creation for apparel products. The seller picks from the founder-curated product catalog, uploads a design file and lifestyle photos, curates which colors to offer, sets a retail price, and publishes. The dropshipper routing is invisible — the seller sees "Unisex Tee", not "T-Mill SKU TSHRT-001"._

_**Watermark distinction:** Lifestyle photos use a small corner watermark (brand identification only). Design files sent to the dropshipper are clean — no watermark. This extends the US-18.2 variant generation pipeline with a `watermarkStyle` parameter._

### US-MFTF-5.1 — Apparel Listing Schema

**As a** platform,
**I want** an `ApparelListing` model that captures the apparel-specific fields a listing needs,
**so that** the data model cleanly separates apparel listings from original artwork and print listings.

**Acceptance Criteria:**
- [ ] `ApparelListing` model in Prisma schema with fields: `id`, `title`, `description`, `productTypeId` (FK to `ProductType`), `retailPrice` (Decimal), `status` (enum reusing existing `ListingStatus`: `ACTIVE | ARCHIVED | SOLD`), `sellerId` (FK to User), `designImageUrl` (the clean design file stored in Blob, used for dropshipper submission), `createdAt`, `updatedAt`
- [ ] `ApparelListingColor` join model: `id`, `apparelListingId`, `productTypeColorId` (FK to `ProductTypeColor`), `isOffered` (boolean) — represents the seller's color curation for this listing
- [ ] `ApparelListingImage` model: `id`, `apparelListingId`, `displayUrl`, `gridUrl`, `thumbnailUrl`, `originalUrl`, `isPrimary`, `sortOrder` — lifestyle photos, same variant structure as `ArtworkImage`
- [ ] `Order` model gains a nullable `apparelListingId` FK alongside the existing `originalListingId`; exactly one must be non-null per order (enforced at application layer, not DB constraint)
- [ ] Schema applied via `prisma db push`

**TDD Notes:**
- Test file: `__tests__/mftf-5-apparel-listing/US-MFTF-5.1-apparel-listing-schema.test.ts`
- Integration tests: create an `ApparelListing` with associated colors and images, query back with relations, assert field round-trip
- Test that an `ApparelListingColor` correctly references a `ProductTypeColor` from the parent `ProductType`

---

### US-MFTF-5.2 — Lifestyle Photo Upload with Corner Watermark

**As a** platform,
**I want** lifestyle photos for apparel listings to go through the existing variant pipeline but with a corner watermark instead of the aggressive diagonal watermark,
**so that** brand identification is present without degrading the marketing value of the photo.

**Acceptance Criteria:**
- [ ] `generateVariants()` in `src/lib/artworks/variants.ts` accepts an optional `watermarkStyle: 'diagonal' | 'corner'` parameter; defaults to `'diagonal'` to preserve existing behavior
- [ ] `'corner'` mode: places a small brand name or logo in the bottom-right corner of the display variant at approximately 8% of image width, with 70% opacity; grid and thumbnail variants are not watermarked in corner mode
- [ ] Design files (the clean file sent to the dropshipper) bypass variant generation entirely — they are stored as-is in Blob at their original resolution with no watermark applied
- [ ] All existing US-18.2 tests continue to pass (diagonal watermark behavior unchanged)
- [ ] New tests cover corner watermark placement and the no-watermark design file path

**TDD Notes:**
- Test file: `__tests__/mftf-5-apparel-listing/US-MFTF-5.2-lifestyle-watermark.test.ts`
- Unit tests: pass a test image through `generateVariants()` with `watermarkStyle: 'corner'`, assert display variant has watermark, assert grid/thumbnail do not
- Assert that the watermark pixel region in the bottom-right corner differs from the no-watermark baseline
- Regression: run existing US-18.2 test suite to confirm diagonal behavior unchanged

---

### US-MFTF-5.3 — Create Apparel Listing Form

**As a** seller,
**I want** to create a new apparel listing by selecting a product type, uploading my design and lifestyle photos, curating colors, and setting a price,
**so that** I can put a new product up for sale.

**Acceptance Criteria:**
- [ ] A "New apparel listing" option is accessible from the seller dashboard (alongside existing "New artwork listing")
- [ ] Form step 1 — Product & Design: dropdown of active `ProductType` records (shows name only, no dropshipper details); design file upload (accepted formats: PNG, SVG, TIFF; up to 70 MB; stored clean, no watermark); title field; description field
- [ ] Form step 2 — Colors: displays all active colors for the selected `ProductType` as a grid of swatches (color name, hex swatch); seller toggles which colors to offer; at least one color must be selected to proceed; size options for the product type are shown as read-only information ("Sizes offered: S, M, L, XL, 2XL")
- [ ] Form step 3 — Photos & Price: lifestyle photo upload (up to 10 photos; processed through corner-watermark variant pipeline); retail price field (USD, required, minimum $1); a note "Sizes are offered based on product availability — no size-specific pricing"
- [ ] Form step 4 — Review & Publish: summary of all entered data with an edit link back to each step; "Save as Draft" and "Publish" buttons
- [ ] `createApparelListingAction` server action validates all required fields, persists the listing in `ARCHIVED` status when saved as draft and `ACTIVE` when published
- [ ] On publish, seller is redirected to the listing's public page
- [ ] Unauthenticated or non-seller users calling the action receive `{ error: 'Unauthorized' }`

**TDD Notes:**
- Test file: `__tests__/mftf-5-apparel-listing/US-MFTF-5.3-create-apparel-listing.test.ts`
- Server action unit tests: missing title, no colors selected, price below minimum, missing design file
- Integration test: full happy path — create listing with two colors, two lifestyle photos, assert `ApparelListing`, `ApparelListingColor`, and `ApparelListingImage` records all created correctly
- Auth guard: non-seller returns error

---

### US-MFTF-5.4 — Edit Apparel Listing

**As a** seller,
**I want** to edit an existing apparel listing,
**so that** I can update photos, adjust the price, or change which colors are offered.

**Acceptance Criteria:**
- [ ] Edit page at `/seller/apparel/[listingId]/edit` is pre-populated with all current listing data
- [ ] Seller can update: title, description, price, offered colors (add or remove, subject to: at least one must remain), lifestyle photos (add new, remove existing, reorder)
- [ ] Product type cannot be changed after creation (removing that product type would invalidate the existing color selections and design file)
- [ ] Design file can be replaced; replacing it does not affect lifestyle photos
- [ ] `updateApparelListingAction` validates and persists changes
- [ ] Active listings can be edited; sold listings show a read-only view

**TDD Notes:**
- Test file: `__tests__/mftf-5-apparel-listing/US-MFTF-5.4-edit-apparel-listing.test.ts`
- Unit tests: attempt to remove last color returns validation error; attempt to change product type returns error
- Integration test: update price and toggle a color off, assert DB reflects changes
- Auth guard: non-owner returns error
