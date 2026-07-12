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
