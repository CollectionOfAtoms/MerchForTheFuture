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
