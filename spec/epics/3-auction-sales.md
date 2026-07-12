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
