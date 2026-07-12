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
