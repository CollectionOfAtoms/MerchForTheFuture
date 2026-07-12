## Epic MFTF-15: Seller Fulfillment for Originals

_Added 2026-06-18. Moves physical-original fulfillment from admin to seller (the hybrid split decided in the 2026-06-18 spec session). The seller ships their own originals from a seller-scoped queue; the admin retains an exception queue for dropship provider failures (re-homed from US-14.5). Dropshipped fulfillment is unchanged — it remains fully automated via US-MFTF-12.5 and MFTF-14. The buyer-facing fulfillment page (US-14.1/14.2) stays buyer-locked; only its status source is aligned. **US-14.5 is partially superseded by this epic:** its originals-shipping responsibility moves to US-MFTF-15.1; its dropship-exception/retry responsibility is re-homed to US-MFTF-15.2 as admin-only._

### US-MFTF-15.1 — Seller Originals Fulfillment Queue

**As a** seller,
**I want** a queue of my own paid original-artwork orders awaiting shipment,
**so that** I can pack and ship the pieces I'm responsible for.

**Acceptance Criteria:**
- [ ] A seller-scoped page (e.g. `/seller/fulfillment`) lists original-artwork orders where the order's `sellerId` matches the session user, status is paid, shipping address is confirmed, and the item has not yet shipped
- [ ] The queue is **seller-locked**: a seller sees only their own orders; another seller's originals never appear; non-sellers are redirected
- [ ] Dropshipped (apparel/print) line items **never** appear in this queue — they fulfill automatically and are not a seller responsibility
- [ ] Each row shows: artwork thumbnail, title, buyer name, confirmed shipping address, date paid, sale amount
- [ ] The seller can mark an original as `SHIPPED` and enter tracking number + carrier; doing so transitions the order and triggers the buyer `SHIPPED` email via the same path as US-MFTF-14.3
- [ ] The seller can mark an original `DELIVERED`, which transitions the order and triggers the buyer `DELIVERED` email via the US-MFTF-14.3 path. (Manual mark-delivered is in scope for this story; carrier-tracking auto-detection of delivery for originals remains a future enhancement, but the manual action must work and be tested now.)

**TDD Notes:**
- Test file: `__tests__/mftf-15-seller-fulfillment/US-MFTF-15.1-seller-originals-queue.test.ts`
- Auth/ownership: seller A cannot see seller B's originals; non-seller redirected
- Data: seed a paid original + a paid dropship apparel order; assert only the original appears
- Action test: mark shipped persists tracking + fires the lifecycle-email path (US-MFTF-14.3)
- Action test: mark delivered transitions the order to `DELIVERED` and fires the `DELIVERED` lifecycle email (US-MFTF-14.3)

### US-MFTF-15.2 — Admin Dropship Exception Queue (re-homed from US-14.5)

**As an** admin,
**I want** a queue of failed dropship fulfillment orders with per-shipment retry,
**so that** provider failures are a platform responsibility, not a seller's.

**Acceptance Criteria:**
- [ ] An admin-only page lists `FulfillmentOrder` rows in `FAILED` (the dropship fan-out failures from US-MFTF-12.5), each with the recorded error and a retry action that re-runs `fulfill()` for that shipment only
- [ ] This queue contains **only** automated-provider failures — physical originals are not shown here (they live in the seller queue, US-MFTF-15.1)
- [ ] Retry is idempotent (reuses US-MFTF-12.5 guarantees): a retry that succeeds moves the shipment `FAILED` → `CONFIRMED`; the provider order is not duplicated
- [ ] Non-admins are redirected
- [ ] US-14.5's prior dual responsibility is now split: its originals-shipping function is superseded by US-MFTF-15.1; its dropship-exception function is re-homed here as admin-only

**TDD Notes:**
- Test file: `__tests__/mftf-15-seller-fulfillment/US-MFTF-15.2-admin-exception-queue.test.ts`
- Auth: non-admin redirected
- Retry: FAILED → CONFIRMED, no duplicate provider order; originals never appear in this queue

### US-MFTF-15.3 — Buyer Fulfillment Page Status Source Alignment

**As a** buyer,
**I want** my order page to show accurate status for originals (seller-shipped) and dropship items (provider-driven) uniformly,
**so that** my experience is consistent regardless of who ships.

**Acceptance Criteria:**
- [ ] The buyer fulfillment/order page (US-14.1 / US-14.4 / US-22.2) derives original-item status from the seller-driven transitions (US-MFTF-15.1) and dropship-item status from provider-driven transitions (MFTF-14), with no buyer-facing distinction between the two mechanisms
- [ ] Provider and seller identities are not exposed differently — the buyer sees shipment status and tracking, not who performed the action
- [ ] No change to the buyer-locked access control already established in US-14.1 (this is a status-source/copy adjustment, not a re-open of access logic)

**TDD Notes:**
- Test file: `__tests__/mftf-15-seller-fulfillment/US-MFTF-15.3-buyer-status-source.test.ts`
- Component/integration: an original marked shipped by its seller and a dropship shipment marked shipped by webhook render identical buyer-facing status/tracking UI

### US-MFTF-15.4 — Seller Sale Notification Email

**As a** seller,
**I want** an email the moment one of my originals sells,
**so that** I know to pack and ship it without watching the queue.

**Acceptance Criteria:**
- [ ] When an original-artwork order (fixed-price buy-now or auction win) is paid, the seller who owns the artwork is emailed exactly once
- [ ] The email shows the artwork to ship with a thumbnail sourced only from our own uploaded images (never a provider mockup)
- [ ] The email shows the buyer's name and the confirmed shipping address
- [ ] The email links to the seller fulfillment page (`/seller/fulfillment`) where the seller enters tracking
- [ ] Dropshipped (apparel/print) orders do not trigger this email — those fulfill automatically

**TDD Notes:**
- Test file: `__tests__/mftf-15-seller-fulfillment/US-MFTF-15.4-seller-sale-notification.test.ts`
- Sent to the seller (not the buyer); fires from the paid transition; no-op for non-original orders
