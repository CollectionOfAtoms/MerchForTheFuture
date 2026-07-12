## Epic 22: Buyer Order History & Order Detail

### US-22.1 — Buyer Orders Page

**As a** buyer,
**I want to** see a dedicated page listing all my orders,
**so that** I can review my purchase history without going through the dashboard.

**Acceptance Criteria:**
- A page at `/buyer/orders` is accessible only to authenticated buyers; unauthenticated users are redirected to sign-in.
- Lists all orders for the buyer, newest first, including both original artwork orders and print orders.
- Each row shows: artwork thumbnail, artwork title (or "Print order" if no artwork title), order date, total amount, a type badge (Original / Print), and a status badge (Pending / Paid / Processing / Shipped / Delivered / Cancelled).
- Each row is a link to `/buyer/orders/[orderId]`.
- Empty state: "You haven't placed any orders yet." with a link to `/browse`.
- The buyer dashboard's Order History section: each existing order row becomes a link to `/buyer/orders/[orderId]`, and a "View all orders →" link is added at the bottom of the section pointing to `/buyer/orders`.
- The desktop nav user dropdown (US-23.1) and mobile menu include an "Orders" link to `/buyer/orders` for buyers.

### US-22.2 — Order Detail Page

**As a** buyer,
**I want to** view a dedicated detail page for a single order,
**so that** I can see all its information, take action if needed, and get help.

**Acceptance Criteria:**
- A page at `/buyer/orders/[orderId]` is authenticated and buyer-locked; any other user receives a redirect.
- Displays: artwork thumbnail, artwork title, artist name, order type (Original purchase / Auction win / Print), order date, order ID (last 8 chars uppercased), status badge, and total amount paid.
- When a shipping address is confirmed on the order, it is displayed.
- For shipped orders: carrier name and tracking number are shown.
- For print orders with status Processing: "Est. 5–7 business days" is shown.
- When `order.status === "PENDING"`: a prominent "Complete your order →" button links to `/orders/[orderId]/fulfill`.
- When `order.status === "PENDING"`: a "Cancel order" button is shown (see US-22.3).
- A "Contact support" button is always shown (see US-22.4).
- A "← Back to orders" link returns to `/buyer/orders`.

### US-22.3 — Cancel Pending Order

**As a** buyer with a pending order,
**I want to** cancel it from the order detail page,
**so that** I am not held to a payment I no longer intend to make.

**Acceptance Criteria:**
- "Cancel order" is only rendered when `order.status === "PENDING"`.
- Clicking shows an inline confirmation ("Are you sure? This cannot be undone.") with Confirm and Dismiss actions before submitting.
- A `cancelOrderAction` server action verifies the authenticated user owns the order and its status is still PENDING, then sets `status → CANCELLED`.
- If the order is not PENDING when the action runs, it returns `{ error: "Order cannot be cancelled." }` and makes no mutation.
- On success, the page re-renders in CANCELLED state; the cancel and complete-order buttons are no longer shown.
- No cancellation email is sent for buyer-initiated cancellations.

### US-22.4 — Contact Support About an Order

**As a** buyer,
**I want to** send a support message about a specific order directly from the order detail page,
**so that** I can get help without leaving the site.

**Acceptance Criteria:**
- A "Contact support" button on the order detail page opens a modal dialog.
- The modal contains a labelled `<textarea>` ("Describe your issue") and a Send button.
- The message field is required; the Send button is disabled until the textarea has non-whitespace content.
- Submitting calls a `contactSupportAction` server action that verifies the authenticated user owns the order, looks up the seller's email via `order → originalListing → sellerId → User.email`, and sends a transactional email via Resend to that address.
- The email contains: subject line `Support request — Order #[last-8-id-uppercased]`, the artwork's primary image, the order date, the order ID, and the buyer's message verbatim.
- On success, the modal displays "Your message has been sent." and closes automatically after 2 seconds.
- On failure, the modal shows an inline error and preserves the typed message so the user can retry.
- Unauthenticated calls to the action return `{ error: "Unauthorized" }`.

_Provider note (2026-06-25): the current transactional email provider is **MailerSend**; a vestigial **Resend** mailer is retained as a fallback in case of revert. Wherever this spec says "Resend," read it as "the transactional mailer (MailerSend, Resend retained as fallback)." See project_description.md → Technology._
