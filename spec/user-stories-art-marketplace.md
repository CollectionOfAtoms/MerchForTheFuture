# Art Marketplace — User Stories

## Project Summary

An online marketplace for a renewable energy themed art auction. Sellers list artwork with images, choose between fixed-price sales or auctions for original pieces, and receive payments to a business account. Buyers browse, bid, or purchase artwork using credit cards. The platform also offers high-quality prints of digital artwork via Prodigi print-on-demand integration, allowing buyers who can't afford or don't win an original to purchase a premium print without leaving the site. The platform handles international tax calculation based on buyer location.

**Key concept:** A single piece of artwork can have two listing types — an "Original" listing (fixed price or auction, one-of-one) and a "Print" listing (unlimited, fulfilled by Prodigi). When browsing, each artwork appears only once; the product page presents whichever purchase options are available for that piece.

---

## Epic 1: Artwork Listing & Product Page

### US-1.1 — Create Listing
**As a** seller,
**I want to** create a product page for my artwork,
**so that** potential buyers can view it.

**Acceptance Criteria:**
- Seller can create a new listing from their dashboard.
- Listing is saved as a draft until explicitly published.
- Each listing has a unique URL / product page.

### US-1.2 — Upload Images
**As a** seller,
**I want to** upload one or more high-resolution images of my artwork,
**so that** buyers can see the piece in detail.

**Acceptance Criteria:**
- Supports multiple image uploads per listing (minimum 1 required).
- Accepted formats: JPEG, PNG, WebP.
- Images are displayed in a gallery or carousel on the product page.
- Thumbnails are auto-generated for browse/search views.

### US-1.3 — Add Artwork Details
**As a** seller,
**I want to** add a title, description, dimensions, medium, and year to my listing,
**so that** buyers have the context they need.

**Acceptance Criteria:**
- Title (required), description (required), dimensions, medium, and year fields are available.
- Text fields support basic formatting (bold, italic, line breaks).
- All details are displayed on the product page.

### US-1.4 — Choose Sale Type
**As a** seller,
**I want to** choose between "fixed price" and "auction" as the sale type,
**so that** I can sell in whichever way suits the piece.

**Acceptance Criteria:**
- Seller selects one of two sale types at listing creation: "Fixed Price" or "Auction."
- The selected type determines which additional fields are shown (price vs. bid/reserve/end date).
- Sale type can be changed before the listing receives any bids or purchases.

### US-1.5 — Edit Listing
**As a** seller,
**I want to** edit my listing details after publishing,
**so that** I can correct mistakes or update information.

**Acceptance Criteria:**
- Seller can edit title, description, images, dimensions, medium, and year at any time.
- For auctions with active bids, the seller cannot change the starting bid or reserve price.
- Edits are reflected on the product page immediately.

### US-1.6 — Remove Listing
**As a** seller,
**I want to** unpublish or delete a listing,
**so that** I can remove artwork I no longer want to sell.

**Acceptance Criteria:**
- Seller can unpublish (hide from browse/search) or permanently delete a listing.
- Listings with completed sales are archived, not deleted, to preserve transaction history.
- Auctions with active bids cannot be deleted; seller must cancel the auction first.

---

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

---

## Epic 3: Auction Sales

### US-3.1 — Configure Auction
**As a** seller,
**I want to** set a starting bid, an optional reserve price, and an auction end date,
**so that** I can control the terms of the auction.

**Acceptance Criteria:**
- Seller sets a starting bid amount (required).
- Seller optionally sets a reserve price (hidden from buyers).
- Seller sets an auction end date and time (with timezone).
- Auction duration must be at least 24 hours.

### US-3.2 — Place Bid
**As a** buyer,
**I want to** place a bid on an auction listing,
**so that** I can compete for artwork I am interested in.

**Acceptance Criteria:**
- Buyer enters a bid amount that must exceed the current highest bid by a minimum increment.
- Bid is recorded with a timestamp and buyer ID.
- Buyer must be logged in to bid.
- Buyer receives confirmation that their bid was placed.

### US-3.3 — View Auction Status
**As a** buyer,
**I want to** see the current highest bid and time remaining,
**so that** I can decide whether to bid.

**Acceptance Criteria:**
- Current highest bid amount is displayed on the product page.
- Countdown timer shows time remaining.
- Number of bids is visible.
- Bid history is optionally viewable (amounts only, bidder identities hidden).

### US-3.4 — Outbid Notification
**As a** buyer,
**I want to** receive a notification if I am outbid,
**so that** I have a chance to bid again.

**Acceptance Criteria:**
- Buyer receives an email and/or in-app notification when outbid.
- Notification includes a link back to the auction listing.
- Notification is sent within 1 minute of being outbid.

### US-3.5 — Auction Close
**As a** seller,
**I want to** the auction to close automatically at the scheduled end time and notify the winning bidder,
**so that** the sale proceeds smoothly.

**Acceptance Criteria:**
- Auction closes at the scheduled end time (server-side, not client-side).
- Winning bidder is notified via email and in-app notification.
- Seller is notified of the winning bid.
- Listing status changes to "Sold" (or "Reserve Not Met" if applicable).

### US-3.6 — Reserve Price Protection
**As a** seller,
**I want to** the sale not to go through if the reserve price is not met,
**so that** I am not forced to sell below my minimum.

**Acceptance Criteria:**
- If highest bid is below the reserve price at auction close, no sale occurs.
- Seller is notified that the reserve was not met.
- Highest bidder is notified that the reserve was not met.
- Seller can choose to re-list, offer the piece to the highest bidder, or withdraw.

---

## Epic 4: Payments (Credit Card to Business)

### US-4.1 — Pay by Credit Card
**As a** buyer,
**I want to** pay for my purchase with a credit card,
**so that** I can complete the transaction conveniently.

**Acceptance Criteria:**
- Checkout accepts major credit cards (Visa, Mastercard, Amex, Discover).
- Payment form collects card number, expiration, CVC, and billing address.
- Payment is processed through a PCI-compliant payment gateway (e.g., Stripe).

### US-4.2 — Secure Payment Processing
**As a** buyer,
**I want to** my payment to be processed securely,
**so that** my financial information is protected.

**Acceptance Criteria:**
- All payment data is transmitted over HTTPS/TLS.
- Card details are tokenized; raw card numbers are never stored on the platform.
- Payment gateway handles PCI DSS compliance.
- 3D Secure / SCA is supported where required by the buyer's region.

### US-4.3 — Seller Payouts
**As a** seller,
**I want to** payments to be deposited into my linked business account,
**so that** I receive the proceeds of my sales.

**Acceptance Criteria:**
- Seller connects a bank account or payout method during onboarding (e.g., Stripe Connect).
- After a successful sale, funds (minus platform fees) are transferred to the seller.
- Payout schedule is configurable (e.g., daily, weekly) or follows a default hold period.

### US-4.4 — Transaction Records
**As a** seller,
**I want to** see a clear record of each transaction (amount, fees, net payout),
**so that** I can track my revenue.

**Acceptance Criteria:**
- Seller dashboard shows a transaction history with: sale price, platform fee, payment processing fee, net payout, and date.
- Records are exportable as CSV.
- Each record links back to the associated listing.

### US-4.5 — Purchase Confirmation
**As a** buyer,
**I want to** receive a receipt or confirmation email after payment,
**so that** I have proof of purchase.

**Acceptance Criteria:**
- Buyer receives a confirmation email with: artwork title, price paid, taxes, total, order number, and seller info.
- A receipt is also viewable in the buyer's account under order history.

---

## Epic 5: Tax Calculation (via Stripe Tax)

_This epic uses **Stripe Tax** rather than a separate tax service like TaxJar or Avalara. Stripe Tax is enabled directly in the Stripe Dashboard and integrates natively with our existing Stripe Checkout / Payments flow, so tax calculation, display, and reporting happen inside the same payment stack we already use. Stripe Tax handles US sales tax, EU/UK VAT, GST in CA/AU/NZ/SG, and a growing list of other jurisdictions. It also tracks nexus thresholds and warns when we approach them in a new jurisdiction._

_**Important:** Stripe Tax calculates and reports — it does **not** file taxes for us. Filing in jurisdictions where we have collection obligations remains a manual responsibility (or one delegated to a CPA). Stripe Tax is also not a substitute for legal/accounting advice on whether we have nexus in a given jurisdiction; that determination is a human decision._

### US-5.1 — Auto-Calculate Tax by Buyer Location (Stripe Tax)
**As a** buyer,
**I want to** see accurate tax applied to my purchase based on my location,
**so that** I know my total cost and the transaction is legally compliant.

**Acceptance Criteria:**
- Stripe Tax is enabled on the Stripe account and active for all Checkout / Payment Intent flows.
- Tax is calculated server-side by Stripe based on the buyer's shipping or billing address.
- Applicable tax types are handled automatically by Stripe: US sales tax, EU/UK VAT, GST (CA/AU/NZ/SG), and other supported jurisdictions.
- Tax amount and rate are displayed during checkout before payment confirmation.
- Tax breakdown (rate, jurisdiction, amount) is included on the Stripe-generated receipt.
- For buyers in jurisdictions where the platform has not registered for tax collection, Stripe Tax follows the configured behavior (e.g., do not collect, or collect and remit) — the configuration is documented in `/docs/tax-configuration.md`.

### US-5.2 — Tax-Exempt Handling
**As a** buyer with tax-exempt status (e.g., a registered nonprofit or reseller),
**I want to** apply my exemption to a purchase,
**so that** I am not charged tax on qualifying purchases.

**Acceptance Criteria:**
- Buyer can upload a tax-exempt certificate (PDF or image) from their account settings.
- Admin reviews and approves the certificate before exempt status is granted.
- Once approved, the buyer's Stripe Customer record is updated with the appropriate tax exemption status (`exempt` or `reverse`) via the Stripe API.
- Stripe Tax automatically applies the exemption at checkout for that customer.
- Transaction records show the exemption applied and reference the certificate on file.

### US-5.3 — Tax Reporting via Stripe Dashboard
**As an** admin,
**I want to** access tax collection reports for filing purposes,
**so that** I can file accurate tax returns in jurisdictions where the platform has obligations.

**Acceptance Criteria:**
- Tax collection reports are accessed through the Stripe Dashboard (Stripe Tax > Reports), exportable as CSV.
- The admin dashboard includes a link to the Stripe Tax reports section with a brief explanation of how to use it.
- Stripe Tax's nexus monitoring is enabled; the admin is notified (via Stripe and surfaced on the admin dashboard) when the platform approaches or crosses a registration threshold in a new jurisdiction.
- For sellers operating under Stripe Connect, individual seller tax reports follow Stripe Connect's standard reporting (1099-K for eligible US sellers is generated automatically by Stripe).

### US-5.4 — Multi-Currency Display
**As a** buyer,
**I want to** see prices and taxes in my local currency,
**so that** I understand the total cost without manual conversion.

**Acceptance Criteria:**
- Buyer's currency is auto-detected from location at first visit and can be overridden in account preferences.
- Prices on listing pages are displayed in the buyer's local currency, with the seller's listing currency shown as secondary information.
- At checkout, Stripe handles the actual currency conversion and charge; the receipt documents both the charged currency and the conversion rate used.
- Exchange rates for display purposes are refreshed at least daily from a reliable source (e.g., Stripe's exchange rate API or an FX service).

---

## Epic 6: User Accounts & Authentication

### US-6.1 — Account Creation
**As a** visitor,
**I want to** create an account (as a buyer, seller, or both),
**so that** I can use the platform.

**Acceptance Criteria:**
- Registration via email/password or OAuth (Google, Apple).
- User selects role(s) during signup: buyer, seller, or both.
- Email verification is required before full access.

### US-6.2 — Secure Login
**As a** user,
**I want to** log in securely,
**so that** my account and data are protected.

**Acceptance Criteria:**
- Login via email/password or OAuth.
- Optional two-factor authentication (TOTP or SMS).
- Account lockout after repeated failed attempts.
- Session timeout after period of inactivity.

### US-6.3 — Seller Onboarding
**As a** seller,
**I want to** connect my business bank account or payout method during onboarding,
**so that** I can receive funds.

**Acceptance Criteria:**
- Guided onboarding flow for sellers to connect a payout method (e.g., Stripe Connect onboarding).
- Seller provides required business information (name, address, tax ID).
- Payout method is verified before the seller can publish listings.

---

## Epic 7: Browsing & Discovery

### US-7.1 — Browse Artwork
**As a** buyer,
**I want to** browse all available artwork,
**so that** I can discover pieces I like.

**Acceptance Criteria:**
- A main browse page displays published listings in a grid or gallery layout.
- Listings show: thumbnail image, title, price or current bid, and sale type badge.
- Pagination or infinite scroll for large result sets.

### US-7.2 — Filter & Sort
**As a** buyer,
**I want to** filter and sort listings by price, medium, sale type, and other attributes,
**so that** I can find what I am looking for.

**Acceptance Criteria:**
- Filter options: sale type (fixed/auction), availability (original/prints/both), price range, medium, dimensions, year.
- Sort options: newest, price low-to-high, price high-to-low, ending soonest (auctions).
- Filters and sort are combinable and URL-addressable for shareability.

### US-7.3 — Search
**As a** buyer,
**I want to** search for artwork by keyword or artist name,
**so that** I can locate specific pieces.

**Acceptance Criteria:**
- Search bar is accessible from all pages.
- Search queries match against title, description, artist/seller name, and medium.
- Results are ranked by relevance.
- No-results state suggests alternative searches or shows popular listings.

### US-7.4 — Unified Artwork Display
**As a** buyer,
**I want to** see each artwork only once when browsing, regardless of whether it has an original listing, a print listing, or both,
**so that** the catalog feels curated and not cluttered with duplicates.

**Acceptance Criteria:**
- Browse and search results show one card per artwork, not one card per listing type.
- The card indicates what is available: "Original," "Prints," or both via badges or labels.
- Clicking the card goes to a product page where both purchase options (if they exist) are accessible.
- If the original is sold, the artwork still appears in browse results as long as prints are available.

---

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

---

## Epic 9: Seller Dashboard & Listing Management

_Completed in Phase 1. Stories US-9.1 through US-9.6 are documented here retroactively._

### US-9.1 — Listings Nav Link
**As a** seller,
**I want to** see a "Listings" link in the top navigation,
**so that** I can quickly access my listing management dashboard.

**Acceptance Criteria:**
- Sellers see a "Listings" link in the top nav when logged in.
- Admins see an "Admin" link instead (or in addition).
- Buyers do not see seller-specific nav items.

### US-9.2 — Seller Listings Index
**As a** seller,
**I want to** see all of my listings in a grid on my dashboard,
**so that** I can manage them at a glance.

**Acceptance Criteria:**
- Dashboard displays a grid of all seller's listings.
- Each card shows the listing image, status badge, price, and sale type.
- Action buttons (edit, archive, delete) are accessible from each card.

### US-9.3 — Create New Listing
**As a** seller,
**I want to** create a new listing from my dashboard,
**so that** I can put artwork up for sale.

**Acceptance Criteria:**
- Form collects artwork details and at least one image.
- Seller chooses fixed-price or auction sale type.
- Form validates required fields before submission.
- On success, redirects to the edit page for the new listing.

### US-9.4 — Edit Listing Details
**As a** seller,
**I want to** edit an existing listing's details,
**so that** I can update information after publishing.

**Acceptance Criteria:**
- Edit form is pre-populated with current listing data.
- Editable fields: title, description, medium, dimensions, year, price/reserve.
- Fields are locked on sold listings and on auction-specific fields when bids exist.

### US-9.5 — Archive / Activate Listing
**As a** seller,
**I want to** toggle a listing between Active and Archived,
**so that** I can temporarily hide artwork without deleting it.

**Acceptance Criteria:**
- Seller can archive an active listing (removes from browse/search).
- Seller can reactivate an archived listing.
- Sold listings cannot be toggled.

### US-9.6 — Admin Project Tracker View
**As an** admin,
**I want to** view the project tracker at /admin/tracker,
**so that** I can monitor development progress.

**Acceptance Criteria:**
- Formatted tracker page at /admin/tracker.
- Per-epic progress bars showing completion percentage.
- Story status badges (Not Started, Test Written, In Progress, Passed).
- Commit log displayed below.

---

## Epic 10: Browse & Product Page UX

### US-10.1 — Browse Gallery Layout
**As a** buyer,
**I want to** browse listings at /browse in a tiled masonry layout,
**so that** I can visually scan available artwork in an engaging, gallery-like experience.

**Acceptance Criteria:**
- The /browse page displays listings in a masonry (packed tile) grid layout where images of varying aspect ratios fit together without whitespace gaps.
- Each tile shows the first image of the listing as the thumbnail.
- Tiles are clickable and navigate to the listing's dedicated product page.
- The layout is responsive: adjusts column count based on viewport width (e.g., 2 columns on mobile, 3–4 on desktop).
- Only active, published listings appear. Sold and archived listings are excluded.
- Listings load with pagination or infinite scroll to avoid loading all images at once.

### US-10.2 — Listing Detail Page
**As a** buyer,
**I want to** view a single listing on its own dedicated page,
**so that** I can see all details about an artwork before deciding to buy or bid.

**Acceptance Criteria:**
- Each listing has a unique URL (e.g., /listings/[id] or /artwork/[slug]).
- The page displays:
  - Title of the artwork
  - Image carousel showing all uploaded images, with navigation (arrows/dots/swipe)
  - Artist name (linked to artist profile if available)
  - Description
  - Medium
  - Dimensions
  - For fixed-price listings: the selling price with a "Buy Now" button
  - For auction listings: the current highest bid (or starting bid if no bids), bid count, countdown timer, and a "Place Bid" form
- Page is server-rendered for SEO (artwork title, description, and first image in meta tags).
- If the listing is sold, the page shows a "Sold" badge and disables purchase/bid actions.

---

## Epic 11: Seller Listing Lifecycle

### US-11.1 — Require Image on Listing Creation
**As a** seller,
**I should not be able to** publish a listing without uploading at least one image,
**so that** every listing in the marketplace has a visual representation.

**Acceptance Criteria:**
- The listing creation form prevents submission if no image has been uploaded.
- A clear validation message is shown: "At least one image is required."
- The "Publish" / "Create" button is disabled until an image is attached.
- This is enforced both client-side (form validation) and server-side (API rejects listings with zero images).

### US-11.2 — Deactivate Listing
**As a** seller,
**I want to** deactivate a listing,
**so that** it is hidden from buyers without being permanently deleted.

**Acceptance Criteria:**
- Seller can set a listing to "Inactive" from the listings dashboard.
- Inactive listings do not appear in /browse or search results.
- Inactive listings are still visible on the seller's dashboard with an "Inactive" status badge.
- Seller can reactivate an inactive listing at any time.
- Auctions with active bids cannot be deactivated; seller must cancel the auction first.
- _Note: This extends US-9.5 (Archive/Activate) with clearer naming and enforcement rules._

### US-11.3 — Delete Unsold Listing
**As a** seller,
**I want to** permanently delete a listing that has not been sold,
**so that** I can remove artwork I no longer want associated with my account.

**Acceptance Criteria:**
- Seller can delete a listing from the listings dashboard.
- Deletion is only allowed if the listing has NOT been sold (status is not "Sold").
- Sold listings show a disabled delete button with a tooltip: "Sold listings cannot be deleted."
- Before deletion, the seller is shown a confirmation dialog: "This will permanently remove this listing and its images. This cannot be undone."
- On confirmation, the listing and associated images are permanently removed.
- Auctions with active bids cannot be deleted; the auction must be cancelled or completed first.

---

## Epic 12: Buyer Experience

### US-12.1 — Place Bid on Auction (UI Flow)
**As a** buyer,
**I want to** place a bid on a listing marked for auction directly from the listing detail page,
**so that** I can participate in the auction without navigating away.

**Acceptance Criteria:**
- Auction listing detail pages display a bid input field and "Place Bid" button.
- The minimum acceptable bid (current highest bid + increment, or starting bid if no bids) is shown as placeholder text or a label.
- Submitting a valid bid shows a success confirmation inline (no page reload).
- Submitting an invalid bid (below minimum, non-numeric) shows a clear error message.
- The current bid display updates after a successful bid.
- Buyer must be logged in; unauthenticated users see a prompt to sign in.
- _Note: This is the UI implementation of US-3.2. US-3.2 covered the backend logic; this story covers the buyer-facing flow._

### US-12.2 — My Bids Page
**As a** buyer,
**I want to** see a list of all listings I have bid on,
**so that** I can track my active auctions and know where I stand.

**Acceptance Criteria:**
- A "My Bids" page is accessible from the buyer's account menu or navigation.
- The page lists all listings the buyer has placed at least one bid on.
- For each listing, the page shows: artwork thumbnail, title, the buyer's highest bid, the current highest bid, auction status (active / ended / won / outbid), and time remaining (if active).
- Listings where the buyer is the current highest bidder are visually distinguished (e.g., green highlight or "Winning" badge).
- Listings where the buyer has been outbid are visually distinguished (e.g., orange/red highlight or "Outbid" badge).
- Each row links to the listing detail page.

### US-12.3 — Outbid Email Notification
**As a** buyer,
**I want to** receive an email notification when I have been outbid on an auction item,
**so that** I can decide whether to place a higher bid before the auction ends.

**Acceptance Criteria:**
- When a buyer is outbid, an email is sent to their registered email address.
- The email includes: artwork title, the new highest bid amount, time remaining in the auction, and a direct link to the listing page.
- The email is sent within 2 minutes of the outbid event.
- Buyers can opt out of outbid emails from their account settings.
- _Note: This is the email delivery implementation of US-3.4. US-3.4 specified the requirement; this story covers the actual email integration._

### US-12.4 — Buyer Account Settings
**As a** buyer,
**I want to** manage my account settings including billing information,
**so that** my payment details are ready when I want to make a purchase.

**Acceptance Criteria:**
- A "Settings" or "Account" page is accessible from the buyer's account menu.
- The page includes sections for:
  - Profile: name, email, password change
  - Billing: saved payment methods managed via Stripe (add, remove, set default). Card details are never stored on the platform; Stripe handles tokenization.
  - Shipping: saved shipping addresses (add, edit, remove, set default)
  - Notifications: toggle email preferences (outbid alerts, purchase confirmations, newsletter)
- Changes are saved with a success confirmation.
- Billing section uses Stripe Elements or Stripe Customer Portal for PCI compliance.

---

## Epic 13: Role-Based Dashboards ⚡ PRIORITY

_This epic should be implemented before Epics 10–12. The admin dashboard provides project visibility during continued development, and the seller/buyer dashboards establish the authenticated home experience that all subsequent features build on._

### US-13.1 — Admin Dashboard (Homepage)
**As an** admin,
**I want to** land on an admin dashboard when I log in,
**so that** I can see a useful summary of project progress and site health at a glance.

**Acceptance Criteria:**
- When a user with the admin role logs in, their homepage (/) redirects to or renders the admin dashboard.
- The dashboard displays a **project tracker summary** pulled from `project-tracker.json`, including:
  - Overall completion: total stories, count and percentage by status (Passed, In Progress, Test Written, Not Started, Deferred)
  - A visual progress bar or chart showing overall completion
  - Per-epic breakdown: each epic shown as a row or card with its own progress bar (e.g., "Epic 3: Auction Sales — 6/6 Passed")
  - A list of stories currently in "Not Started" or "In Progress" status, so the admin can see what's next
- The dashboard also displays **site activity metrics**:
  - Total listings (active, sold, archived)
  - Total registered users (by role: buyers, sellers, admins)
  - Recent activity feed: last 10 actions (new listings, bids placed, purchases completed)
- The dashboard is read-only; no inline editing of tracker data.
- The existing /admin/tracker page (US-9.6) remains available as a detailed drill-down view linked from the dashboard.

### US-13.2 — Seller Dashboard (Homepage)
**As a** seller,
**I want to** land on a seller dashboard when I log in,
**so that** I can see my listings and buyer activity at a glance.

**Acceptance Criteria:**
- When a user with the seller role logs in, their homepage (/) redirects to or renders the seller dashboard.
- The dashboard displays:
  - **My Listings summary:** counts by status (active, archived, sold), with links to the full listings management page (US-9.2)
  - **Active listings:** a compact grid or list of currently active listings showing thumbnail, title, sale type, price or current bid, and time remaining (for auctions)
  - **Recent activity:** a feed of recent events on the seller's listings — new bids received, purchases completed, auctions ending soon (within 24 hours)
  - **Revenue snapshot:** total revenue from completed sales (fixed-price + auction), and if prints are enabled, a separate print revenue line
- Each listing in the summary links to its edit page.
- Each activity item links to the relevant listing detail page.
- If the seller has no listings, the dashboard shows an empty state with a prominent "Create Your First Listing" call-to-action.

### US-13.3 — Buyer Dashboard (Homepage)
**As a** buyer,
**I want to** land on a buyer dashboard when I log in,
**so that** I can see my bidding activity, purchases, and order history at a glance.

**Acceptance Criteria:**
- When a user with the buyer role logs in, their homepage (/) redirects to or renders the buyer dashboard.
- The dashboard displays three sections:
  - **My Active Bids:** a list of all auctions the buyer currently has a bid on, showing: artwork thumbnail, title, the buyer's highest bid, the current highest bid, whether the buyer is winning or outbid (with visual indicator), and time remaining. Each row links to the listing detail page.
  - **Current Top Bids:** a highlighted subset of active bids where the buyer IS the current highest bidder, shown prominently (e.g., top of page or a "Winning" section). This can be a filtered view of the active bids list or a separate card section.
  - **Order History:** a list of completed purchases (both fixed-price and auction wins), showing: artwork thumbnail, title, purchase date, amount paid, and order status (completed, shipped, delivered). Each row links to the order detail or receipt.
- If the buyer has no bids or orders, each section shows an appropriate empty state (e.g., "You haven't placed any bids yet. Browse artwork to get started." with a link to /browse).
- The dashboard updates when the page is loaded (does not require real-time updates, but should reflect the current state).

---

## Epic 14: Post-Sale Fulfillment (Originals)

_This epic covers the flow after a buyer wins an auction or completes a fixed-price purchase for an original artwork. The platform/admin handles all physical shipping; the buyer's responsibility is confirming their shipping address and completing payment (for auction wins). Prints are fulfilled separately via Prodigi (Epic 8)._

### US-14.1 — Post-Sale Fulfillment Page
**As a** buyer who has won an auction or purchased an original artwork,
**I want to** be directed to a private fulfillment page where I can complete my order,
**so that** I can provide my shipping details and finalize the transaction.

**Acceptance Criteria:**
- After a successful fixed-price purchase or auction win, the buyer is shown a link (and emailed a link) to a fulfillment page at a unique URL (e.g., /orders/[orderId]/fulfill).
- The fulfillment page is **authenticated and buyer-locked**: only the buyer associated with this order can access it. All other users (including other authenticated buyers) see a 403 or redirect.
- The page displays a summary of what was purchased: artwork thumbnail, title, artist name, sale type (auction win or fixed-price), and the amount paid or owed.
- For fixed-price purchases, payment is already complete at this point; the page is for shipping confirmation only. Shipping is collected after payment.
- For auction wins, if payment has not yet been collected (e.g., the auction only captured a bid, not a charge), the page includes a payment step (see US-14.3).
- The page clearly communicates the next steps: "Confirm your shipping address below and we'll handle the rest."

### US-14.2 — Shipping Address Confirmation
**As a** buyer on the fulfillment page,
**I want to** confirm or provide my shipping address,
**so that** the platform can ship the artwork to the right location.

**Acceptance Criteria:**
- The fulfillment page shows a shipping address form.
- If the buyer has a saved shipping address on their account (from sign-up or account settings — see US-12.4), it is **pre-populated as the default**. The buyer can accept it as-is or edit it.
- If the buyer has no saved address, the form is blank and all fields are required.
- Required fields: full name, street address line 1, street address line 2 (optional), city, state/province, postal code, country.
- Country field is a dropdown; state/province adapts based on selected country.
- The buyer can optionally save the entered address to their account for future use (checkbox: "Save this address to my account").
- After confirming the address, the buyer clicks a "Confirm Shipping" button.
- The address is validated for completeness before submission (client-side and server-side).

### US-14.3 — Auction Win Payment Collection
**As a** buyer who has won an auction,
**I want to** complete payment on the fulfillment page,
**so that** I can pay for the artwork I won.

**Acceptance Criteria:**
- For all order types, the fulfillment page presents payment first, then collects the shipping address after payment succeeds.
- The payment amount is the winning bid amount (for auctions) or the purchase/print price.
- The tax breakdown is displayed before the buyer submits payment.
- Payment is collected via Stripe using the same checkout components as the fixed-price flow (Stripe Elements or Checkout).
- If the buyer has a saved payment method on their account, it is offered as a default option.
- On successful payment, the order status updates to "Paid" and the page transitions to a confirmation view.
- If payment fails, the buyer sees a clear error and can retry.
- The buyer has a configurable window to complete payment (e.g., 48 hours after auction close). If payment is not completed within the window, the admin is notified and can take action (offer to the next bidder, re-list, etc.).

### US-14.4 — Fulfillment Confirmation & Order Status
**As a** buyer who has confirmed shipping and completed payment,
**I want to** see a confirmation and be able to track my order status,
**so that** I know the artwork is on its way.

**Acceptance Criteria:**
- After the buyer completes payment and confirms shipping, the fulfillment page shows a confirmation view with: artwork details, confirmed shipping address, amount paid, and estimated processing time.
- The buyer receives a confirmation email with the same details.
- The order appears in the buyer's order history on their dashboard (US-13.3) with a status of "Processing."
- The fulfillment page remains accessible at the same URL and displays the current order status as it progresses.

### US-14.5 — Admin Fulfillment Queue
**As an** admin,
**I want to** see a queue of orders awaiting fulfillment,
**so that** I can pack and ship the artwork.

**Acceptance Criteria:**
- The admin dashboard (or a dedicated /admin/fulfillment page linked from the dashboard) shows a list of all orders that are paid and have a confirmed shipping address but have not yet been shipped.
- Each order in the queue shows: artwork thumbnail, title, buyer name, shipping address, date paid, and sale amount.
- The admin can mark an order as "Shipped" and enter a tracking number and carrier name.
- When an order is marked as shipped, the buyer receives an email notification with the tracking information.
- The order status updates to "Shipped" on the buyer's fulfillment page and dashboard.
- The admin can also mark orders as "Delivered" when confirmed, or this can be automated via carrier tracking API in a future iteration.

### US-14.6 — Payment Deadline for Auction Wins
**As an** admin,
**I want to** be notified when an auction winner has not completed payment within the allowed window,
**so that** I can ensure the artwork is offered to the next eligible bidder automatically.

**Acceptance Criteria:**
- A configurable payment window (default: 48 hours) starts when the auction closes and the winner is notified.
- At 24 hours remaining, the buyer receives a reminder email with the artwork image: "You have 24 hours to complete payment for [artwork title]."
- When the window expires without payment, the order status changes to `CANCELLED` and the buyer receives a cancellation email with the artwork image.
- The admin receives an in-app notification that the payment window has lapsed.
- The system automatically finds the next-highest bidder and creates a new PENDING order for them with a fresh 48-hour payment window.
- The runner-up receives an email with the artwork image notifying them the item is available at their bid amount, with a link to the fulfillment page.
- If no other bidders exist, the listing is marked `ARCHIVED`.
- The expired buyer's fulfillment page shows a message: "The payment window for this item has closed. Please contact us if you believe this is an error."

---

## Epic 15: Listing-Page Purchase & Print Availability

_This epic adds direct purchase actions on the listing detail page and introduces a simpler print availability model: rather than separate "original" and "print" listings (as originally specified in Epic 8), each listing now carries an "available for print" toggle. When enabled, buyers can order a print of the artwork directly from the same listing page, alongside the original purchase or auction action. This changes how prints are surfaced — instead of a dual-listing browse experience, prints are an attribute of a listing, and a dedicated /prints page filters listings by that attribute._

_**Note on Epic 8:** The Prodigi integration and order pipeline from Epic 8 still apply — the change is in how prints are exposed in the UI (toggle on a single listing instead of a separate listing entity). Epic 8 stories that have already passed remain valid; this epic adjusts the seller-facing and buyer-facing surfaces._

### US-15.1 — Buy from Listing Page (Fixed-Price)
**As a** buyer,
**I want to** purchase a "For Sale" artwork directly from the artwork's listing page,
**so that** I can complete the transaction without navigating to a separate checkout entry point.

**Acceptance Criteria:**
- Fixed-price listings display a clearly visible "Buy Now" button on the listing detail page.
- Clicking "Buy Now" initiates the checkout flow inline (modal or dedicated checkout page) without losing the buyer's context.
- The flow uses Stripe Checkout or Stripe Elements with Stripe Tax enabled, so tax is calculated based on the buyer's billing/shipping address before payment.
- Unauthenticated buyers are prompted to sign in or create an account before checkout.
- On successful payment, the listing is marked Sold (per US-2.4) and the buyer is redirected to the post-sale fulfillment page (US-14.1).
- _Note: This formalizes the UI flow that complements US-2.3 (Buy Now backend). If US-2.3's implementation already includes the listing-page button, this story is a verification/completeness pass._

### US-15.2 — Print Availability Toggle on Listing
**As a** seller,
**I want to** toggle "available for print" on each of my listings,
**so that** I can offer prints of my artwork without managing a separate print listing.

**Acceptance Criteria:**
- The listing creation and edit forms include an "Available for Print" toggle (boolean).
- When enabled, the seller is prompted to provide print-specific information: the print-ready high-resolution source file (separate from gallery images if needed), the print products available (selected from Prodigi's catalog — paper print, canvas, framed, etc.), available sizes per product, and retail price per product/size combination.
- The platform validates the source image resolution against the selected print sizes (warns if DPI is too low, per US-8.6).
- When disabled, no print options are shown to buyers regardless of any previously configured print settings (the configuration is preserved but inactive).
- The toggle and its associated configuration are part of the same listing entity — there is no separate "PrintListing" record.
- Existing listings created under the old dual-listing model are migrated: any existing print listing is folded into its parent artwork listing as a print configuration with the toggle enabled.

### US-15.3 — Prints Page (Filtered Browse)
**As a** buyer,
**I want to** see only artworks that are available for print on the /prints page,
**so that** I can browse exclusively for pieces I can purchase as prints.

**Acceptance Criteria:**
- A new /prints page displays only listings where "Available for Print" is enabled.
- The page uses the same masonry/tiled layout as /browse (per US-10.1) for visual consistency.
- Each tile shows the first image of the listing and a "Prints from $X" label indicating the lowest-priced print option.
- Sold or archived listings still appear on /prints if prints remain available (the original may be sold, but prints are unlimited).
- Tiles link to the listing detail page (US-10.2) with a query parameter or anchor that scrolls/focuses the print purchase section.
- /prints supports the same filtering and sorting options as /browse (per US-7.2), with an additional filter for print product type (paper print, canvas, framed).

### US-15.4 — Order a Print from Listing Page
**As a** buyer,
**I want to** order a print directly from the artwork's listing page,
**so that** I can purchase a print without leaving the page.

**Acceptance Criteria:**
- On listings where "Available for Print" is enabled, the listing detail page (US-10.2) includes a print purchase section alongside the original purchase / bid action.
- The print section displays available product types (paper, canvas, framed), sizes, and prices, with a mockup preview showing the artwork in the selected format (using Prodigi's mockup API or generated previews, per US-8.2).
- The buyer selects product type, size, and quantity, then clicks "Order Print" to proceed to checkout.
- Print checkout uses the same Stripe + Stripe Tax flow as other purchases, with the shipping address determining the tax calculation.
- On successful payment, the platform creates a Prodigi order via their API (per US-8.3) and the buyer is shown an order confirmation with expected production and shipping timeline.
- The print order appears in the buyer's order history (US-13.3) with a status of "Processing" and updates as Prodigi reports progress (per US-8.4).
- Buying a print does **not** affect the availability of the original artwork — they are independent transactions.

### US-15.5 — Structured Artwork Dimensions
**As a** seller,
**I want to** enter artwork dimensions as separate width, height, and unit (in/cm) fields when I create or edit a listing,
**so that** the values are always valid numbers and machine-readable.

**Acceptance Criteria:**
- Create and edit forms have width (number), height (number), and unit select (in/cm).
- Width and height are required on create; validated as positive finite numbers.
- Saved in canonical format "W×H unit" (e.g., "16×20 in").
- Invalid (non-positive, non-numeric) values return a validation error.
- Edit form pre-populates from stored string, handling legacy formats like `24" × 36"`.

### US-15.6 — Print Catalog Filtered by Aspect Ratio
**As a** seller enabling prints for a listing,
**I want to** see only print sizes whose proportions match my artwork's aspect ratio (within 10%),
**so that** I don't accidentally offer sizes that require cropping or padding.

**Acceptance Criteria:**
- Only sizes within 10% of the artwork's normalized aspect ratio are shown.
- List is sorted by ascending ratio difference (closest match first).
- Falls back to the full catalog if dimensions are not set or no sizes match.
- Previously-saved products are always shown even if outside the ratio threshold.
- A note "Showing sizes that match your artwork's proportions" appears when filtering is active.

### US-15.7 — Print Cost Estimates in Setup
**As a** seller configuring print options,
**I want to** see the estimated Prodigi fulfillment cost (~$X) next to each size,
**so that** I can make informed decisions about how much to charge.

**Acceptance Criteria:**
- `src/lib/print/costs.json` contains a cost for every catalog SKU.
- Costs are populated by running `scripts/fetch-prodigi-costs.ts` (one-time, committed).
- The seller edit form displays "~$X" (rounded to nearest dollar) next to each size.
- No live API calls are made at runtime — costs are bundled statically.
- Canvas SKUs use the "White" wrap attribute for cost calculation.

---

## Epic 16: Seller UX Improvements

### US-16.1 — Seller Thumbnail Links to Artwork Page

**As a seller**, I want clicking the thumbnail image on a listing row in my listings dashboard to take me to the public artwork page, so I can quickly preview how my listing looks to buyers.

**Acceptance Criteria:**
- Each thumbnail in `/seller/listings` is wrapped in a link to `/artwork/[artworkId]`.
- Clicking the thumbnail navigates to the public artwork detail page.
- Listings with no image display a placeholder that is also a link.

---

### US-16.3 — Admin User Role Elevation

**As an admin**, I want to view all registered users and grant or revoke Seller and Admin roles, so I can onboard sellers and manage platform access without touching the database directly.

**Acceptance Criteria:**
- `/admin/users` lists all users with their current roles.
- Each user row has toggle buttons for the Seller and Admin roles; clicking saves immediately.
- The Buyer role is always present and cannot be removed.
- An admin cannot remove their own Admin role.
- Non-admins calling the action receive an "Unauthorized" error.
- Unknown role values are rejected.
- The `updateUserRolesAction` server action is the single enforcement point.

---

### US-16.2 — Edit Listing Button on Artwork Page

**As a seller**, when I visit the public artwork page for one of my own listings, I want to see an "Edit listing" button that takes me directly to the edit form, so I can make changes without navigating back through the dashboard.

**Acceptance Criteria:**
- When the logged-in user is the artwork's seller, an "Edit listing" link appears on the artwork detail page.
- The link points to `/seller/listings/[listingId]/edit`.
- The button is not shown to buyers or unauthenticated visitors.
- `getArtworkDetail` exposes `sellerId` so the page can compare it against the session user.

---

## Epic 17: Password Reset

### US-17.1 — Request Password Reset

**As a** user (buyer, seller, or admin),
**I want to** request a password reset by entering my email address,
**so that** I can regain access to my account if I forget my password.

**Acceptance Criteria:**
- A "Forgot password?" link is visible on the sign-in page.
- Clicking it shows a form with a single email field.
- Submitting a valid email sends a password reset email containing a time-limited link (expires in 1 hour).
- If the email is not registered, the form still shows the same success message (no account enumeration).
- If the email is registered, a `PasswordResetToken` record is created in the database linked to the user.
- Only one active reset token exists per user at a time — issuing a new request invalidates any previous token.
- The reset email contains the user's name and a clearly labelled link to `/auth/reset-password?token=[token]`.

---

### US-17.2 — Set New Password via Reset Link

**As a** user who has requested a password reset,
**I want to** click the link in my email and enter a new password,
**so that** I can regain access to my account.

**Acceptance Criteria:**
- Visiting `/auth/reset-password?token=[token]` renders a "Set new password" form.
- If the token is missing, expired, or already used, the page shows a clear error and a link back to the forgot-password form.
- The form requires a new password and a confirmation field; they must match.
- Password must be at least 8 characters.
- On success, the user's `passwordHash` is updated, the token is marked as used, and the user is redirected to `/sign-in` with a success message.
- The reset token cannot be reused after a successful reset.

---

## Epic 18: Image Upload & Processing Pipeline

### US-18.1 — Accept High-Resolution Artwork Uploads

**As a** seller,
**I want to** upload artwork images up to 70 MB in size,
**so that** I can provide the highest quality source file for display and print production.

**Acceptance Criteria:**
- The listing creation and edit forms accept image files up to 70 MB.
- Supported formats: JPEG, PNG, TIFF, WebP.
- Files are uploaded directly from the browser to cloud storage via a signed URL (no routing through the Next.js API server).
- A progress indicator is shown during upload.
- Files exceeding 70 MB are rejected with a clear error message before upload begins.
- Unsupported file formats are rejected client-side with a clear error message.

---

### US-18.2 — Automatic Image Variant Generation

**As a** platform,
**I want to** automatically generate three derivative image variants whenever a seller uploads artwork,
**so that** the correct resolution is served for each context without manual intervention.

**Acceptance Criteria:**
- On upload completion, a background job processes the source file and produces three variants:
  - **Display variant** (watermarked): resized to a maximum of 2400 px on the longest edge, JPEG quality 85, with a semi-transparent watermark applied (platform logo or "© [artist name]" text overlaid in the bottom-right corner).
  - **Grid variant** (un-watermarked): resized to a maximum of 800 px on the longest edge, JPEG quality 75. Used for masonry browse tiles.
  - **Thumbnail variant**: resized to exactly 400 × 400 px (cover crop), JPEG quality 70. Used for seller dashboard cards, order confirmations, and email thumbnails.
- All three variants are stored in cloud storage alongside the source file.
- The `ArtworkImage` database record is updated with URLs for each variant (`displayUrl`, `gridUrl`, `thumbnailUrl`).
- If variant generation fails, the original upload URL is used as a fallback so the listing is not blocked.
- Variant generation does not block the seller's save action — it runs asynchronously after the upload is confirmed.

### US-18.3 — Seller Can Regenerate Image Variants

**As a** seller,
**I want to** trigger variant regeneration for an existing listing image,
**so that** I can fix incorrectly processed variants (e.g. rotated images) without deleting and re-uploading the original.

**Acceptance Criteria:**
- A "Regenerate" button (↺) is visible on each image card in the listing edit page image section when the image is in the `done` state.
- Clicking "Regenerate" transitions the image to `processing` state (spinner shown, other controls disabled).
- On success, the image transitions back to `done` and its `displayUrl` is updated in local state.
- On failure, the image transitions to `error` state and an error message is displayed.
- The action verifies the requesting user is the listing's seller; unauthenticated or unauthorised calls return an error.
- The button is disabled while any other image in the set is uploading or processing.

---

## Epic 19: Artwork Image Lightbox & Magnifier

### US-19.1 — Open Image Lightbox from Artwork Detail Page

**As a** buyer,
**I want to** click on the artwork image on the detail page to open it in a full-screen lightbox,
**so that** I can view the artwork as large as possible on my screen.

**Acceptance Criteria:**
- Clicking any image on the artwork detail page opens a lightbox overlay.
- The lightbox displays the **display variant** (watermarked, high-resolution) image centred on screen.
- The image is scaled to fill as much of the viewport as possible while maintaining aspect ratio.
- The page behind the lightbox is darkened with a semi-transparent backdrop.
- Clicking the backdrop (outside the image) closes the lightbox.
- The cursor on the artwork thumbnail changes to indicate it is clickable (e.g., `cursor-zoom-in`).

---

### US-19.2 — Carousel Navigation Inside Lightbox

**As a** buyer viewing an artwork's lightbox,
**I want to** cycle through all images for that artwork using arrow keys or swipe gestures,
**so that** I can inspect every photo without closing the lightbox.

**Acceptance Criteria:**
- When multiple images exist, left/right arrow buttons are shown inside the lightbox.
- Pressing the left/right arrow keys on the keyboard navigates to the previous/next image.
- Swiping left or right on touch devices navigates to the previous/next image.
- Navigation wraps around (last image → first, first image → last).
- The current image index is indicated (e.g., "2 / 5").
- When only one image exists, navigation controls are hidden.

---

### US-19.3 — Close Lightbox

**As a** buyer viewing the lightbox,
**I want to** close it easily,
**so that** I can return to the artwork detail page.

**Acceptance Criteria:**
- A close button (× icon) is displayed in the top-right corner of the lightbox.
- Pressing the Escape key closes the lightbox.
- Clicking the backdrop closes the lightbox.
- When the lightbox is open, body scroll is locked to prevent the page scrolling behind it.
- Closing the lightbox restores the page to its previous scroll position.

---

### US-19.4 — Magnifier Lens on Hover in Lightbox

**As a** buyer viewing an artwork in the lightbox,
**I want to** hover my mouse over the image and see a magnified view of the area under my cursor,
**so that** I can inspect fine detail and brushwork in the artwork.

**Acceptance Criteria:**
- When the user moves their mouse over the lightbox image, a circular magnifier lens appears following the cursor.
- The lens displays the portion of the image underneath the cursor at approximately 2–3× zoom.
- The magnifier uses the full-resolution **display variant** as its source to ensure detail is sharp.
- The magnifier does not appear on touch devices (where pinch-to-zoom is the native equivalent).
- The magnifier disappears when the cursor leaves the image.
- The lens has a clearly defined border so it is visually distinct from the image behind it.

---

## Epic 20: Mobile Usability

### US-20.1 — Mobile Navigation

**As a** user on a mobile device,
**I want to** navigate the site in a usable way,
**so that** I can browse, bid, and manage my account without needing a desktop.

**Acceptance Criteria:**
- The navigation bar collapses into a hamburger menu on small screens (below `sm` breakpoint).
- All nav links (Browse, Auctions, Prints, My Bids, Settings, Listings, Admin, Sign in/out) are accessible from the mobile menu.
- The mobile menu opens and closes smoothly and can be dismissed by tapping outside it or pressing Escape.
- The mobile menu has an animation when opening based off of this codepen example https://codepen.io/alvarotrigo/pen/LYQNMOb, but using the thematic web-colors of the site. 
- The site logo remains visible and links to the home page on all screen sizes.
- Touch targets (buttons, links) are at least 44×44px on mobile.
- No horizontal overflow or content clipped by the viewport on any core page (browse, artwork detail, checkout, dashboards, settings).

---

## Epic 21: Stripe Checkout Sessions Migration & Payment UX

### US-21.1 — Migrate Payment Collection to Stripe Checkout Sessions

**As a** platform,
**I want to** use Stripe's Checkout Sessions API (`ui_mode: "elements"`) instead of the Payment Intents API,
**so that** our integration follows Stripe's current recommended pattern and stays compatible with features like Adaptive Pricing.

**Acceptance Criteria:**
- The `/api/payment-intent` route is replaced by a `/api/checkout-session` route that creates a Stripe `Session` with `ui_mode: "elements"`, `line_items` derived from the order amount, and a `return_url` of `/orders/[orderId]/fulfill?session_id={CHECKOUT_SESSION_ID}`.
- `PaymentForm` is rewritten to use `CheckoutElementsProvider` (imported from `@stripe/react-stripe-js/checkout`) initialised with the session's `client_secret`, and confirms payment with `checkout.confirm()` rather than `stripe.confirmPayment()`.
- The Stripe webhook listener changes from handling `payment_intent.succeeded` to `checkout.session.completed`; `fulfillPayment` is updated to look up the order by the session's metadata `orderId` field.
- The `Order` model retains a `stripePaymentIntentId` column for historical records; new orders store the Checkout Session ID in a new `stripeSessionId` field (schema migration required).
- All existing payment tests are updated to reflect the new API; MSW intercepts are updated to include `/v1/checkout/sessions`.
- No change to the buyer-facing UI beyond what is required by the API swap.

### US-21.2 — Show Order Confirmation Immediately After Payment

**As a** buyer who has just paid,
**I want to** see a clear confirmation screen immediately after payment succeeds,
**so that** I am not left on a "Complete Your Order" screen with no indication that payment was accepted.

**Acceptance Criteria:**
- After `checkout.confirm()` succeeds on the client, the buyer is redirected to `/orders/[orderId]/fulfill?session_id=[id]`.
- The fulfillment page detects the `session_id` query parameter and calls a server-side helper (`resolveSessionFulfillment`) that verifies the session IDs match, retrieves the Stripe Session, verifies its `payment_status === "paid"`, and synchronously calls `fulfillPayment()` before rendering.
- If `fulfillPayment()` has already been called (idempotency guard), the helper exits cleanly without error.
- The fulfillment page uses a **payment-first** flow: the Stripe Checkout section is displayed before the shipping address form for all order types (auction wins, fixed-price originals, and prints).
- After payment succeeds (order status PAID), the page presents a shipping address form. Once the shipping address is submitted, the final confirmation view is shown.
- For print orders, the Prodigi fulfillment API call is made in `confirmShippingAction` (not at payment time) since shipping details are not yet available when payment is processed.
- If the session ID in the query param does not match the order's stored `stripeSessionId`, the helper no-ops safely.
- The webhook handler (`checkout.session.completed`) continues to function as a reliable fallback for cases where the redirect does not fire.

---

## Epic 22: Buyer Order History & Order Detail

### US-22.1 — Buyer Orders Page

**As a** buyer,
**I want to** see a dedicated page listing all my orders,
**so that** I can review my purchase history without going through the dashboard.

**Acceptance Criteria:**
- A page at `/buyer/orders` is accessible only to authenticated buyers; unauthenticated users are redirected to sign-in.
- Lists all orders for the buyer, newest first, including both original artwork orders and print orders.
- Each row shows: artwork thumbnail, artwork title (or "Print order" if no artwork title), order date, total amount, a type badge (Original / Print), and a status badge (Pending / Paid / Processing / Shipped / Delivered / Cancelled).
- Each row is a link to `/buyer/orders/[orderId]`.
- Empty state: "You haven't placed any orders yet." with a link to `/browse`.
- The buyer dashboard's Order History section: each existing order row becomes a link to `/buyer/orders/[orderId]`, and a "View all orders →" link is added at the bottom of the section pointing to `/buyer/orders`.
- The desktop nav user dropdown (US-23.1) and mobile menu include an "Orders" link to `/buyer/orders` for buyers.

### US-22.2 — Order Detail Page

**As a** buyer,
**I want to** view a dedicated detail page for a single order,
**so that** I can see all its information, take action if needed, and get help.

**Acceptance Criteria:**
- A page at `/buyer/orders/[orderId]` is authenticated and buyer-locked; any other user receives a redirect.
- Displays: artwork thumbnail, artwork title, artist name, order type (Original purchase / Auction win / Print), order date, order ID (last 8 chars uppercased), status badge, and total amount paid.
- When a shipping address is confirmed on the order, it is displayed.
- For shipped orders: carrier name and tracking number are shown.
- For print orders with status Processing: "Est. 5–7 business days" is shown.
- When `order.status === "PENDING"`: a prominent "Complete your order →" button links to `/orders/[orderId]/fulfill`.
- When `order.status === "PENDING"`: a "Cancel order" button is shown (see US-22.3).
- A "Contact support" button is always shown (see US-22.4).
- A "← Back to orders" link returns to `/buyer/orders`.

### US-22.3 — Cancel Pending Order

**As a** buyer with a pending order,
**I want to** cancel it from the order detail page,
**so that** I am not held to a payment I no longer intend to make.

**Acceptance Criteria:**
- "Cancel order" is only rendered when `order.status === "PENDING"`.
- Clicking shows an inline confirmation ("Are you sure? This cannot be undone.") with Confirm and Dismiss actions before submitting.
- A `cancelOrderAction` server action verifies the authenticated user owns the order and its status is still PENDING, then sets `status → CANCELLED`.
- If the order is not PENDING when the action runs, it returns `{ error: "Order cannot be cancelled." }` and makes no mutation.
- On success, the page re-renders in CANCELLED state; the cancel and complete-order buttons are no longer shown.
- No cancellation email is sent for buyer-initiated cancellations.

### US-22.4 — Contact Support About an Order

**As a** buyer,
**I want to** send a support message about a specific order directly from the order detail page,
**so that** I can get help without leaving the site.

**Acceptance Criteria:**
- A "Contact support" button on the order detail page opens a modal dialog.
- The modal contains a labelled `<textarea>` ("Describe your issue") and a Send button.
- The message field is required; the Send button is disabled until the textarea has non-whitespace content.
- Submitting calls a `contactSupportAction` server action that verifies the authenticated user owns the order, looks up the seller's email via `order → originalListing → sellerId → User.email`, and sends a transactional email via Resend to that address.
- The email contains: subject line `Support request — Order #[last-8-id-uppercased]`, the artwork's primary image, the order date, the order ID, and the buyer's message verbatim.
- On success, the modal displays "Your message has been sent." and closes automatically after 2 seconds.
- On failure, the modal shows an inline error and preserves the typed message so the user can retry.
- Unauthenticated calls to the action return `{ error: "Unauthorized" }`.

---

## Epic 23: Desktop Nav User Dropdown

### US-23.1 — User Dropdown Menu in Desktop Nav

**As a** signed-in user on a desktop browser,
**I want** my role-specific links and account actions to appear in a dropdown under my name,
**so that** the top nav bar stays uncluttered and Browse, Auctions, and Prints are always visible.

**Acceptance Criteria:**
- Browse, Auctions, and Prints remain as always-visible inline links in the desktop nav bar — no change.
- When signed in, the user's name (or email if no name is set) is rendered as a button with a chevron-down icon. Clicking it toggles a dropdown panel.
- When signed out, the existing Sign in and Sign up links are shown as today — no dropdown.
- The inline role links (My Bids, Settings, Listings, Admin) and the Sign out button are removed from the flat nav and moved into the dropdown.
- **Dropdown contents (role-dependent):** Always present: Dashboard link (role-appropriate), Settings, Sign out. Buyers: My Bids, Orders. Sellers: Listings. Admins: Admin.
- The dropdown is visually distinct: white card, subtle drop shadow, rounded corners, positioned below-right of the trigger button.
- The active page item in the dropdown is visually highlighted.
- The dropdown closes on: second click of the trigger, click outside, or Escape keypress. Escape returns focus to the trigger button.
- **Mobile menu is completely unaffected.**

---

## Tech Stack & Architecture

### Frontend & Framework
- **Framework:** Next.js (App Router) with React
- **Deployment:** Vercel
- **Styling:** Tailwind CSS (or designer's choice — specify in implementation)
- **Image Hosting:** Vercel Blob or a dedicated CDN (e.g., Cloudinary) for artwork images. Artwork images are the core product; they must be served optimized (responsive sizes, WebP/AVIF, lazy loading) with CDN edge caching.

### Backend & API
- **API Layer:** Next.js API Routes and Server Actions (co-located with the frontend on Vercel)
- **ORM:** Prisma (provides type-safe database access, migrations, and works seamlessly with Next.js and Vercel)
- **Authentication:** NextAuth.js (Auth.js) for session management, OAuth, and credential-based login

### Database: PostgreSQL
- **Why PostgreSQL over other SQL options:**
  - **Transactional integrity** — Auctions and payments require ACID guarantees. Concurrent bids need row-level locking or `SELECT ... FOR UPDATE` to prevent race conditions. PostgreSQL handles this natively and reliably.
  - **JSONB columns** — Artwork metadata (dimensions, medium, custom attributes) can vary between listings. PostgreSQL's JSONB lets you store flexible attributes alongside structured relational data without needing a separate NoSQL store.
  - **Full-text search** — PostgreSQL's built-in `tsvector` / `tsquery` full-text search is sufficient for artwork search by title, description, and artist name, avoiding the need for a separate search service at launch.
  - **Money and precision** — The `NUMERIC` type handles currency amounts without floating-point errors.
  - **Vercel compatibility** — Vercel Postgres (powered by Neon) provides serverless PostgreSQL with connection pooling, zero cold starts, and native integration with the Vercel dashboard and environment variables. Alternatively, a managed instance on Supabase, Neon, or Railway works just as well.
  - **Mature ecosystem** — First-class support in Prisma, extensive extension library (e.g., `pg_trgm` for fuzzy search, `pgcrypto` for UUIDs).

### Payments
- **Payment Processor:** Stripe
  - Stripe Checkout or Stripe Elements for the buyer-facing payment form
  - Stripe Connect (Standard or Express) for seller onboarding and payouts to business accounts
  - Stripe handles PCI compliance, 3D Secure / SCA, and multi-currency

### Tax Calculation
- **Tax Service:** Stripe Tax (enabled in the Stripe Dashboard, integrated natively with Stripe Checkout / Payment Intents)
  - Calculated server-side by Stripe at checkout based on buyer address
  - Handles US sales tax, EU/UK VAT, GST (CA/AU/NZ/SG), and other supported jurisdictions
  - Tax breakdown automatically included on Stripe-generated receipts
  - Nexus monitoring built in; alerts when approaching registration thresholds in new jurisdictions
  - **Note:** Stripe Tax calculates and reports but does not file. Filing remains a manual responsibility.

### Real-Time (Auctions)
- **Approach:** Vercel supports WebSockets via third-party providers. Use one of:
  - **Pusher** or **Ably** for real-time bid updates and outbid notifications
  - **Alternatively:** Server-Sent Events (SSE) for simpler one-way updates if full WebSocket isn't needed at launch
- Auction close is handled by a scheduled server-side job (e.g., Vercel Cron or an external scheduler like Inngest)

### Email / Notifications
- **Transactional Email:** Resend, SendGrid, or Postmark for purchase confirmations, outbid alerts, auction results, and print shipping notifications
- **In-App Notifications:** Stored in PostgreSQL, delivered via real-time channel or polling

### Print Fulfillment: Prodigi
- **Service:** Prodigi (https://www.prodigi.com) — premium print-on-demand fulfillment
- **API:** Prodigi REST API v4 (https://api.prodigi.com/v4.0/)
  - **Product catalog** — query available products, sizes, and pricing by destination country
  - **Order creation** — submit orders with source image URL, product SKU, quantity, and shipping address
  - **Order status** — poll or receive webhooks for status updates (created → in production → shipped → delivered)
  - **Image requirements** — high-resolution source files; API returns warnings if DPI is insufficient for selected size
- **Integration pattern:**
  - Source images are stored in the platform's CDN (same high-res uploads used for the gallery)
  - At checkout, the platform creates a Prodigi order server-side, passing the CDN image URL
  - Prodigi handles printing, quality control, packaging, and shipping globally
  - The buyer never interacts with Prodigi directly — the entire experience stays on-site
  - Webhook endpoint receives fulfillment updates and maps them to buyer-facing order statuses

### Key Architecture Notes for Implementation
- **Data model:** An `Artwork` is the parent entity. Each artwork can have up to two child listings: an `OriginalListing` (fixed price or auction, quantity of 1) and a `PrintListing` (unlimited quantity, linked to Prodigi products). Browse/search queries against the `Artwork` table, not listings, to ensure one result per piece.
- Use Next.js App Router with Server Components for product pages (SEO, performance).
- Client Components for interactive elements (bid forms, image galleries, print option selectors, checkout).
- All payment, tax, and Prodigi API logic runs server-side (API routes / server actions) — never expose keys or sensitive logic to the client.
- Image uploads flow through a signed-URL pattern (client → presigned URL → Blob/CDN) to avoid routing large files through the API. Print-ready source files are stored at full resolution in the CDN and the URL is passed to Prodigi at order time.
- Database migrations managed through Prisma Migrate.

---

## Development Methodology: Test-Driven Development (TDD)

### Process

This project follows strict TDD. For every user story, the development cycle is:

1. **Red** — Write a failing test (or tests) derived from the user story's acceptance criteria BEFORE writing any implementation code. Each acceptance criterion becomes at least one test assertion. The test must fail, confirming it is testing something that does not yet exist.
2. **Green** — Write the minimum implementation code required to make the test pass. No more, no less.
3. **Refactor** — Clean up the implementation while keeping all tests green. Improve structure, remove duplication, clarify naming — but do not add functionality beyond what the tests cover.

This cycle repeats for every user story, in order, within each epic. Do not skip ahead to implementation. Do not write implementation code without a corresponding failing test.

### Test Organization

Tests are organized to mirror the user story structure:

```
__tests__/
├── epic-1-listings/
│   ├── US-1.1-create-listing.test.ts
│   ├── US-1.2-upload-images.test.ts
│   ├── US-1.3-artwork-details.test.ts
│   ├── US-1.4-sale-type.test.ts
│   ├── US-1.5-edit-listing.test.ts
│   └── US-1.6-remove-listing.test.ts
├── epic-2-fixed-price/
│   ├── US-2.1-set-price.test.ts
│   └── ...
├── epic-3-auction/
│   ├── US-3.1-configure-auction.test.ts
│   ├── US-3.2-place-bid.test.ts
│   └── ...
├── epic-4-payments/
├── epic-5-tax/
├── epic-6-auth/
├── epic-7-browsing/
├── epic-8-print-shop/
├── epic-9-seller-dashboard/
├── epic-10-browse-product-ux/
│   ├── US-10.1-browse-gallery-layout.test.ts
│   └── US-10.2-listing-detail-page.test.ts
├── epic-11-seller-listing-lifecycle/
│   ├── US-11.1-require-image.test.ts
│   ├── US-11.2-deactivate-listing.test.ts
│   └── US-11.3-delete-unsold-listing.test.ts
└── epic-12-buyer-experience/
    ├── US-12.1-place-bid-ui.test.ts
    ├── US-12.2-my-bids-page.test.ts
    ├── US-12.3-outbid-email.test.ts
    └── US-12.4-buyer-account-settings.test.ts
└── epic-13-dashboards/          # ⚡ PRIORITY — implement first
    ├── US-13.1-admin-dashboard.test.ts
    ├── US-13.2-seller-dashboard.test.ts
    └── US-13.3-buyer-dashboard.test.ts
└── epic-14-fulfillment/
    ├── US-14.1-fulfillment-page.test.ts
    ├── US-14.2-shipping-address.test.ts
    ├── US-14.3-auction-payment.test.ts
    ├── US-14.4-confirmation-status.test.ts
    ├── US-14.5-admin-fulfillment-queue.test.ts
    └── US-14.6-payment-deadline.test.ts
└── epic-15-listing-purchase-prints/
    ├── US-15.1-buy-from-listing.test.ts
    ├── US-15.2-print-availability-toggle.test.ts
    ├── US-15.3-prints-page.test.ts
    └── US-15.4-order-print-from-listing.test.ts
```

### Test Types by Layer

Each user story may require tests at multiple layers. Use the appropriate test type for what the acceptance criterion is actually verifying:

- **Unit tests** — Pure logic: price calculations, bid validation rules, tax computation, DPI validation, auction closing logic. These are fast, isolated, and have no external dependencies.
- **Integration tests** — Database operations: creating listings, placing bids, recording transactions, querying artworks. These test Prisma models against a real (test) PostgreSQL database.
- **API route tests** — HTTP layer: request validation, auth guards, correct status codes, response shapes. Test Next.js API routes and server actions with mocked or real database.
- **Component tests** — React components: forms render correct fields, buttons are disabled/enabled in the right states, galleries display images, auction timers count down. Use React Testing Library.
- **End-to-end tests** — Critical user flows: "buyer finds artwork → selects print options → completes checkout → sees confirmation." These run in a browser against the full stack.

### Testing Stack

- **Test runner:** Vitest (fast, native ESM/TypeScript, compatible with Next.js)
- **React component testing:** React Testing Library + Vitest
- **API / integration testing:** Vitest with a test PostgreSQL database (seeded/reset per suite)
- **End-to-end testing:** Playwright
- **External service mocking:** MSW (Mock Service Worker) for Stripe, Prodigi, and tax API calls during unit and integration tests. E2E tests may use Stripe test mode and Prodigi sandbox.
- **Coverage:** Aim for >90% on business logic (bid validation, payment flows, tax calculation, order creation). UI coverage is secondary to behavioral correctness.

### TDD Mapping Example

To illustrate how acceptance criteria become tests, here is an example using US-3.2 (Place Bid):

**Acceptance Criteria:**
- Buyer enters a bid amount that must exceed the current highest bid by a minimum increment.
- Bid is recorded with a timestamp and buyer ID.
- Buyer must be logged in to bid.
- Buyer receives confirmation that their bid was placed.

**Resulting tests (written BEFORE implementation):**

```
US-3.2-place-bid.test.ts

Unit:
  ✗ rejects a bid that does not exceed current highest bid by minimum increment
  ✗ rejects a bid equal to the current highest bid
  ✗ accepts a bid that exceeds current highest bid by exactly the minimum increment
  ✗ accepts a bid that exceeds current highest bid by more than the minimum increment

Integration:
  ✗ persists a valid bid with timestamp and buyer ID
  ✗ returns the updated highest bid after a successful bid

API:
  ✗ returns 401 if buyer is not authenticated
  ✗ returns 400 if bid amount is missing or invalid
  ✗ returns 200 and confirmation payload on successful bid

Component:
  ✗ bid form displays current highest bid and minimum next bid
  ✗ submit button is disabled when input is below minimum
  ✗ shows confirmation message after successful bid submission
```

All of these tests are written first and must fail. Then implementation proceeds until they pass.

### Instructions for Claude Code

When working through each epic:

1. Read the user stories and acceptance criteria for the epic.
2. Generate the full test file(s) for that epic FIRST. Run them to confirm they fail.
3. Update `project-tracker.json`: set each story's status to "Test Written," fill in the test written date and commit hash.
4. Implement the code to make each test pass, one at a time.
5. After all tests in the epic pass, refactor.
6. Run the full test suite to confirm no regressions.
7. Update `project-tracker.json`: set each passing story's status to "Passed," fill in the test passed date and commit hash. Add a row to the commits array.
8. Commit with a message referencing the epic and story IDs (e.g., "feat(epic-3): implement US-3.1 through US-3.6 — auction sales"). The tracker file MUST be included in the commit.
9. Move to the next epic.

**Critical: Every commit must include an update to `project-tracker.json`.** Commits without a tracker update should be rejected. See the Project Tracker section below for git hook enforcement.

---

## Project Tracker

### File: `project-tracker.json`

This JSON file lives in the project root and is the single source of truth for project progress. It contains two top-level arrays:

**stories** — One object per user story (US-1.1 through US-12.4). Fields:
- id, epic, title
- status: "Not Started" → "Test Written" → "In Progress" → "Passed" (or "Deferred")
- testWrittenDate + testWrittenCommit
- testPassedDate + testPassedCommit
- notes

**commits** — One object per commit. Fields:
- hash (short), date, author, storiesAffected (array of story IDs), message, trackerUpdated (always true)

### Git Hook: Enforce Tracker Updates

Add this pre-commit hook to `.husky/pre-commit` (or `.git/hooks/pre-commit`) during project setup:

```bash
#!/bin/sh

# Verify project-tracker.json is staged with every commit
if ! git diff --cached --name-only | grep -q "project-tracker.json"; then
  echo ""
  echo "ERROR: project-tracker.json must be updated with every commit."
  echo "Stage your tracker changes and try again:"
  echo "  git add project-tracker.json"
  echo ""
  exit 1
fi
```

Make it executable: `chmod +x .husky/pre-commit`

This ensures no commit can land without a corresponding tracker update.

---

## Non-Functional Requirements (for implementation reference)

- **Performance:** Product pages load in under 2 seconds. Auction bid placement completes in under 500ms.
- **Security:** PCI DSS compliance for payments. All data encrypted in transit (TLS) and at rest. OWASP Top 10 mitigated.
- **Scalability:** System handles concurrent auction bidding without race conditions (optimistic locking or similar).
- **Accessibility:** WCAG 2.1 AA compliance.
- **Internationalization:** Support for multiple currencies, locales, and tax jurisdictions from day one.
- **Test Coverage:** >90% coverage on business logic. All user stories have corresponding tests written before implementation. CI pipeline runs the full test suite on every push.
