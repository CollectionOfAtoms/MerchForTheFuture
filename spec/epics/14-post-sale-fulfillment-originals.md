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

### US-14.7 — Runner-Up Offer on Payment Expiry
**As a** runner-up bidder,
**I want to** be offered the item when the original winner fails to pay,
**so that** I get the chance to buy at my bid amount.

**Acceptance Criteria:**
- When an auction winner's payment window expires, the system identifies the next-highest eligible bidder.
- A new PENDING order is created for that bidder with a fresh payment window.
- The runner-up receives an email (with the artwork image) notifying them the item is available at their bid amount, with a link to the fulfillment page.
- If no further eligible bidder exists, the listing is marked `ARCHIVED`.

_Status: Passed (tracker). Added to spec 2026-06-25 to reconcile spec with tracker. Formalizes the runner-up branch described in US-14.6's criteria._

### US-14.8 — Fulfillment Error Email Notification to Seller
**As a** seller,
**I want to** be emailed when a fulfillment error occurs on one of my orders,
**so that** I can intervene before the buyer is affected.

**Acceptance Criteria:**
- When a fulfillment order enters an error/exception state, the responsible seller is notified by email.
- The email identifies the affected order and the nature of the error.
- The notification failure path follows the lifecycle-email contract: a failed send is logged and never rolls back the order's state.

_Status: Passed (tracker). Added to spec 2026-06-25 to reconcile spec with tracker._
