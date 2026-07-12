## Epic 8: Print Shop (Prodigi Integration)

### US-8.1 — Create Print Listing
**As a** seller,
**I want to** create a print listing for my digital artwork,
**so that** buyers can purchase high-quality prints of my piece.

**Acceptance Criteria:**
- Seller uploads a print-ready high-resolution source file (minimum 300 DPI at target print size).
- Seller selects available print products (e.g., giclée art print, canvas, framed print) from Prodigi's catalog.
- Seller selects available sizes for each product type.
- Seller sets a retail price for each product/size combination.
- Print listing is linked to the same parent artwork as the original listing (if one exists).

### US-8.2 — Browse Print Options
**As a** buyer,
**I want to** see all available print options (product type, size, framing) on the artwork's product page,
**so that** I can choose the format that suits me.

**Acceptance Criteria:**
- Product page shows a "Prints" tab or section alongside the original listing (if available).
- Buyer can select product type (paper print, canvas, framed), size, and see the price update accordingly.
- A mockup image showing the print in context (e.g., on a wall, framed) is displayed using Prodigi's or a generated mockup.
- Pricing is clear and includes a note that prints are produced and shipped by a professional print partner.

### US-8.3 — Purchase a Print
**As a** buyer,
**I want to** purchase a print and have it shipped to me without leaving the site,
**so that** the experience is seamless.

**Acceptance Criteria:**
- Buyer selects print options, adds to cart or clicks "Buy Print," and enters shipping address.
- Tax is calculated based on shipping destination (same tax integration as originals).
- Payment is processed via Stripe (same checkout flow as originals).
- After payment, the platform creates an order via the Prodigi Orders API with the source image, product SKU, shipping address, and quantity.
- Buyer sees an order confirmation with expected production and shipping timeline.

### US-8.4 — Print Order Tracking
**As a** buyer,
**I want to** track the status of my print order,
**so that** I know when to expect delivery.

**Acceptance Criteria:**
- Platform receives order status updates from Prodigi via webhooks (or polling).
- Order statuses are mapped to buyer-friendly labels: "Processing," "Printing," "Shipped," "Delivered."
- When Prodigi provides a shipping tracking number, it is displayed in the buyer's order history.
- Buyer receives an email notification when the print ships, including tracking information.

### US-8.5 — Seller Print Revenue
**As a** seller,
**I want to** see revenue from print sales separately from original sales,
**so that** I can understand how each format performs.

**Acceptance Criteria:**
- Seller dashboard shows print sales with: retail price, Prodigi fulfillment cost, platform fee, and net revenue per sale.
- Print revenue is shown separately from original artwork revenue.
- Seller can see total print units sold per artwork.

### US-8.6 — Print Quality Assurance
**As a** seller,
**I want to** preview how my artwork will look as a print before publishing,
**so that** I can ensure quality.

**Acceptance Criteria:**
- During print listing creation, the platform validates the source image resolution against the selected print sizes (warns if DPI is too low for a given size).
- Seller can request a digital proof / mockup preview before publishing.
- Seller can order a physical proof for themselves at cost through Prodigi.
