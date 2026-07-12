## Epic MFTF-11: Cart

_DB-backed shopping cart for guests and authenticated buyers, covering apparel and fine-art prints. Physical originals remain direct buy-now only (1-of-1 items create reservation/concurrency problems in a cart for negligible UX gain). Cart line items are polymorphic over an `itemKind` rather than forcing prints into the listing model — prints remain parameterized purchases off the artwork listing (preserving the US-15.3/15.4/15.6 dynamic-catalog UX), while apparel items reference apparel listings directly._

_**Persistence model:** Guest carts are DB rows keyed by an anonymous token stored in an httpOnly cookie. Authenticated carts are keyed by user. On login or signup, the guest cart merges into the user cart. A daily cleanup cron (Vercel Hobby-compatible — this cron must remain daily-tolerant, unlike the sub-daily auction crons tracked in CHORE-1) removes abandoned guest carts._

_**Staleness rule:** No holds, no reservations. The cart is re-validated server-side at checkout creation (MFTF-12); current price always wins; stale items are flagged and removed with a message._

_**Dependency:** Requires MFTF-5 (apparel listings exist) and MFTF-6 (product detail page with stubbed cart button). US-MFTF-11.3 modifies the behavior of the Passed story US-15.4._

### US-MFTF-11.1 — Cart & CartItem Schema

**As a** platform,
**I want** `Cart` and `CartItem` models that support both guest and authenticated carts with polymorphic line items,
**so that** apparel and prints can share one cart without reworking the listing model.

**Acceptance Criteria:**
- [ ] `Cart` model in Prisma schema with fields: `id`, `userId` (nullable FK to User, unique), `guestToken` (nullable String, unique), `createdAt`, `updatedAt` — exactly one of `userId` / `guestToken` must be non-null (enforced at application layer, matching the US-MFTF-5.1 pattern)
- [ ] `CartItemKind` enum: `APPAREL | PRINT`
- [ ] `CartItem` model: `id`, `cartId` (FK, cascade delete), `itemKind` (`CartItemKind`), `apparelListingId` (nullable FK to `ApparelListing`), `listingId` (nullable FK to the artwork `Listing`, used for prints), `selection` (Json), `quantity` (Int, default 1, min 1 at application layer), `addedAt` — exactly one of `apparelListingId` / `listingId` non-null, matching `itemKind`
- [ ] `selection` shape by kind: `APPAREL` → `{ colorId, sizeLabel }`; `PRINT` → `{ prodigiSku, attributes }` — validated by a per-kind validator module (`src/lib/cart/validators.ts`)
- [ ] `Cart.updatedAt` is touched on every item add, edit, or removal (drives cleanup staleness in US-MFTF-11.6)
- [ ] Schema applied via `prisma db push`

**TDD Notes:**
- Test file: `__tests__/mftf-11-cart/US-MFTF-11.1-cart-schema.test.ts`
- Integration tests: create guest cart and user cart, add one apparel and one print item, query back with relations, assert field round-trip
- Unit tests: per-kind selection validators reject malformed payloads (missing colorId, unknown keys)

---

### US-MFTF-11.2 — Add Apparel to Cart

**As a** buyer,
**I want** to add an apparel item in my chosen color and size to my cart from the product detail page,
**so that** I can keep shopping and purchase multiple items in one checkout.

**Acceptance Criteria:**
- [ ] The "Add to cart" button stubbed in US-MFTF-6.2 is wired to `addToCartAction`; it remains disabled until both a color and size are selected
- [ ] `addToCartAction` validates: listing is ACTIVE, `colorId` is offered on this listing, `sizeLabel` is an active size for the product type
- [ ] Works for unauthenticated users: if no cart exists, a guest cart is created and its `guestToken` set in an httpOnly, secure cookie; authenticated users get a find-or-create user cart
- [ ] Adding an identical selection (same listing, color, size) increments the existing `CartItem.quantity` instead of creating a duplicate row
- [ ] A cart icon with a badge count appears in the site navigation (desktop and mobile); the badge shows the total item quantity across the cart and updates after a successful add without a full page reload
- [ ] On success the buyer receives non-blocking confirmation (e.g. toast or badge animation) and remains on the product page

**TDD Notes:**
- Test file: `__tests__/mftf-11-cart/US-MFTF-11.2-add-apparel-to-cart.test.ts`
- Unit tests: inactive listing, color not offered, invalid size each return validation errors
- Integration tests: guest add creates Cart + CartItem and returns token; duplicate add increments quantity; authenticated add attaches to user cart
- Component tests: badge renders count, updates after add; button disabled until color + size selected (extends US-MFTF-6.2 tests)

---

### US-MFTF-11.3 — Add Print to Cart

**As a** buyer,
**I want** to add a print (in my chosen format and size) to my cart from the artwork page,
**so that** prints and apparel can be purchased together in one checkout.

**Acceptance Criteria:**
- [ ] The print ordering flow on the artwork listing page (US-15.4) ends in "Add to cart" instead of proceeding directly to a single-item checkout; the direct-order path is removed
- [ ] `addToCartAction` (PRINT kind) validates: artwork listing is active, print availability is enabled for the listing (US-15.2 toggle), and the selected Prodigi SKU/attributes are valid for the artwork's aspect ratio
- [ ] `selection` stores the Prodigi SKU and chosen attributes plus a `quotedUnitPrice` snapshot for cart display only — the authoritative price is re-quoted at checkout creation (MFTF-12)
- [ ] Identical print selections (same artwork, SKU, attributes) increment quantity rather than duplicating
- [ ] Guest and authenticated behavior identical to US-MFTF-11.2
- [ ] Existing US-15.4 tests are updated to assert the new add-to-cart outcome; all other Epic 15 tests continue to pass

**TDD Notes:**
- Test file: `__tests__/mftf-11-cart/US-MFTF-11.3-add-print-to-cart.test.ts`
- **Touches Passed story US-15.4** — its test file is modified in the same commit; flag in tracker notes
- Unit tests: print availability off, SKU invalid for aspect ratio
- Integration test: add print to guest cart, assert selection payload round-trips with quoted price snapshot
- MSW: intercept Prodigi quote call used for the display snapshot

---

### US-MFTF-11.4 — Cart Page

**As a** buyer,
**I want** to view and edit the contents of my cart,
**so that** I can adjust quantities and remove items before checking out.

**Acceptance Criteria:**
- [ ] Page at `/cart`, accessible to guests and authenticated buyers, server-rendered from the visitor's cart (guest token cookie or user)
- [ ] Each line item shows: thumbnail (apparel primary lifestyle grid variant; artwork grid variant for prints), title, kind badge ("Apparel" / "Print"), selection summary (color + size, or print format/size), unit price, quantity stepper, line total, and a remove control
- [ ] Quantity changes and removals persist via server actions (`updateCartItemAction`, `removeCartItemAction`) with ownership validation (cart must belong to the requesting guest token or user)
- [ ] Subtotal displayed; a note states that shipping and tax are calculated at checkout
- [ ] Empty-cart state shows links to `/shop` and `/browse`
- [ ] "Proceed to checkout" button navigates to `/checkout` (delivered in MFTF-12; a placeholder route returning 404-safe "coming soon" is acceptable until then)
- [ ] Nav badge count stays in sync after edits and removals

**TDD Notes:**
- Test file: `__tests__/mftf-11-cart/US-MFTF-11.4-cart-page.test.ts`
- Integration tests: update quantity persists; remove deletes row; ownership guard rejects foreign cart manipulation
- Component tests: line item renders kind badge and selection summary; stepper min is 1; empty state renders links

---

### US-MFTF-11.5 — Guest Cart Merge on Authentication

**As a** buyer who built a cart before signing in,
**I want** my cart contents to survive login or account creation,
**so that** I don't lose my selections when I authenticate to check out.

**Acceptance Criteria:**
- [ ] On successful login or signup, if a guest cart cookie is present and the guest cart has items, its items are merged into the user's cart (creating one if none exists)
- [ ] Merge semantics: union of items; rows with identical (`itemKind`, listing reference, `selection`) have quantities summed
- [ ] After merge, the guest cart row is deleted and the guest token cookie is cleared
- [ ] Merge is idempotent — replaying the merge (e.g. double-submit of the auth callback) does not duplicate items
- [ ] Works for both flows: existing-user login and new account creation
- [ ] Nav badge reflects the merged total after authentication

**TDD Notes:**
- Test file: `__tests__/mftf-11-cart/US-MFTF-11.5-guest-cart-merge.test.ts`
- Integration tests: merge into empty user cart; merge with overlapping items sums quantities; guest cart deleted afterward; replay is a no-op
- Auth mocking per project convention (vi.mock of NextAuth session); test the merge function directly plus the auth-callback wiring

---

### US-MFTF-11.6 — Guest Cart Cleanup Cron

**As a** platform,
**I want** abandoned guest carts to be deleted automatically,
**so that** the carts table does not grow unboundedly with anonymous rows.

**Acceptance Criteria:**
- [ ] An API route at `/api/cron/cleanup-carts` deletes guest carts (rows with `guestToken` set) whose `updatedAt` is older than 30 days, cascading their items
- [ ] User carts (`userId` set) are never deleted by the cron
- [ ] Route is protected: requests must carry the `CRON_SECRET` bearer token; unauthorized requests receive 401
- [ ] `vercel.json` schedules the route once daily — **this cron must remain Hobby-compatible (daily or slower)**; do not add sub-daily schedules here (sub-daily crons are the CHORE-1 auction concern and require Pro)
- [ ] Route responds within the 10s serverless limit (single bulk delete query, no per-row loops)

**TDD Notes:**
- Test file: `__tests__/mftf-11-cart/US-MFTF-11.6-cart-cleanup-cron.test.ts`
- Integration tests: seed guest carts at 29 and 31 days stale plus a stale-looking user cart; run handler; assert only the 31-day guest cart is removed
- API tests: 401 without secret; 200 with secret
