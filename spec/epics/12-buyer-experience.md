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
