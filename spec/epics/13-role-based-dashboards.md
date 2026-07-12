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
