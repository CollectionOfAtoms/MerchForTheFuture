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
