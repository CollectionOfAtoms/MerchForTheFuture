## Epic 2: Fixed-Price Sales

### US-2.1 — Set Price
**As a** seller,
**I want to** set a specific price for my artwork,
**so that** a buyer can purchase it outright.

**Acceptance Criteria:**
- Seller enters a price in their local currency during listing creation.
- Price is displayed on the product page with the appropriate currency symbol.

### US-2.2 — View Price
**As a** buyer,
**I want to** see the listed price clearly on the product page,
**so that** I know exactly what I would pay.

**Acceptance Criteria:**
- Price is prominently displayed on the product page.
- If applicable, estimated taxes and shipping are shown before checkout.

### US-2.3 — Buy Now
**As a** buyer,
**I want to** click a "Buy Now" button and proceed to checkout,
**so that** I can purchase the artwork immediately.

**Acceptance Criteria:**
- "Buy Now" button is visible on fixed-price listings.
- Clicking it takes the buyer to a checkout flow (address → tax calculation → payment).
- Buyer must be logged in or prompted to create an account before completing purchase.

### US-2.4 — Auto-Mark as Sold
**As a** seller,
**I want to** the listing to automatically mark as sold after a successful purchase,
**so that** other buyers are not misled.

**Acceptance Criteria:**
- After successful payment, listing status changes to "Sold."
- Product page shows "Sold" badge; "Buy Now" button is disabled.
- Listing is removed from active browse/search results.
