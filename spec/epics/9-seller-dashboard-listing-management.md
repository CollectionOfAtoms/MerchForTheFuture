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
