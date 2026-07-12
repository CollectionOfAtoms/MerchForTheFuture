## Epic MFTF-7: Apparel Checkout & Order Fulfillment ❌ REPLACED

> **Replaced 2026-06-12** by Epic MFTF-11 (Cart) and Epic MFTF-12 (Multi-Provider Checkout & Fulfillment), before implementation began. Single-item apparel checkout was superseded by the multi-item cart checkout model. US-MFTF-7.1 and US-MFTF-7.2 are **Dropped** in the tracker. Stories retained below for history only — do not implement.

_Buyer selects color and size, checks out via Stripe, order is submitted to T-Mill via the fulfillment abstraction layer. Reuses the existing Stripe Checkout Sessions flow (Epic 21). T-Mill order creation slots in where Prodigi currently handles print orders._

_**Dependency:** Requires MFTF-3 (abstraction layer), MFTF-5 (apparel listing schema), and MFTF-2 spike (T-Mill order submission shape). Stories are specifiable now at the interface level; T-Mill-specific implementation details will be filled in after the spike._

### US-MFTF-7.1 — Apparel Order Creation _(Dropped — superseded by US-MFTF-12.3/12.4/12.5)_

**As a** buyer,
**I want** to purchase an apparel item in my chosen color and size,
**so that** I can complete a transaction and have the item shipped to me.

**Acceptance Criteria:**
- [ ] `createApparelOrderAction` server action accepts: `apparelListingId`, `colorId` (FK to `ApparelListingColor`), `sizeLabel` (string matching a `ProductTypeSizeOption`), `quantity` (default 1)
- [ ] Validates: listing is ACTIVE, color is offered on this listing, size is active for the product type, buyer is authenticated
- [ ] Creates an `Order` record with `apparelListingId` set, `status: PENDING`, and stores selected color and size as order metadata
- [ ] Creates a Stripe Checkout Session for the order amount (reusing `createCheckoutSession` from Epic 21)
- [ ] Returns the Stripe session client secret for the embedded checkout component
- [ ] On Stripe webhook `checkout.session.completed`, `fulfillPaymentBySession` marks the order PAID and triggers `submitApparelOrderToFulfillment()` which calls `TeemillFulfillmentProvider.createOrder()` via the abstraction layer

**TDD Notes:**
- Test file: `__tests__/mftf-7-apparel-checkout/US-MFTF-7.1-apparel-order-creation.test.ts`
- Unit tests: invalid color (not offered on listing), inactive size, unauthenticated buyer
- Integration test: full happy path — create order, assert `Order` record created with correct metadata
- MSW: intercept Stripe checkout session creation endpoint
- T-Mill fulfillment call: MSW intercept to T-Mill order endpoint (URL TBD from spike; stub for now)

---

### US-MFTF-7.2 — Apparel Order Confirmation & Shipping _(Dropped — superseded by US-MFTF-12.6)_

**As a** buyer who has paid for an apparel order,
**I want** to see a confirmation and receive shipping updates,
**so that** I know my order is being processed.

**Acceptance Criteria:**
- [ ] After payment, buyer is redirected to `/orders/[orderId]/confirm` showing: product title, color selected, size selected, lifestyle photo thumbnail, amount paid, estimated dispatch ("Usually ships in 3–5 business days")
- [ ] Order appears in buyer's order history (`/buyer/orders`) with type badge "Apparel" and status "Processing"
- [ ] When T-Mill webhook fires with shipment tracking info, `Order` status updates to `SHIPPED` and tracking number is stored
- [ ] Buyer receives a shipping confirmation email (via MailerSend) with tracking number and carrier when status transitions to SHIPPED
- [ ] Shipping confirmation email reuses the existing `sendPurchaseConfirmation` pattern with apparel-specific copy

**TDD Notes:**
- Test file: `__tests__/mftf-7-apparel-checkout/US-MFTF-7.2-apparel-order-confirmation.test.ts`
- Component test: confirmation page renders color, size, thumbnail, estimated dispatch
- Integration test: simulate T-Mill webhook payload, assert Order status → SHIPPED and tracking stored
- Email test: MSW intercepts MailerSend, assert shipping email sent with tracking number
- T-Mill webhook shape: stub based on spike findings; update test when real shape is known
