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
