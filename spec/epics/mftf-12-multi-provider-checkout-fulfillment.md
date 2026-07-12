## Epic MFTF-12: Multi-Provider Checkout & Fulfillment

_**Replaces Epic MFTF-7** (US-MFTF-7.1 and US-MFTF-7.2 are Dropped). Single-item apparel checkout was superseded before implementation: building it knowing it would immediately be rebuilt for multi-item carts is wasted TDD effort. This epic delivers checkout for the whole cart — one embedded Stripe Checkout session, one buyer-facing order — split behind the scenes into per-provider fulfillment orders routed through the fulfillment abstraction layer._

_**Architecture:** `FulfillmentProvider` becomes an abstract base class (not an interface) so every current and future provider — including a possible future self-fulfillment provider where the founders ship their own products — is forced to implement the full workflow. Order splitting groups cart line items by the provider backing each item's product, quotes shipping per provider, and dispatches each group through its provider after payment._

_**Dependency:** Requires MFTF-11 (cart). US-MFTF-12.1 refactors code delivered by Passed stories US-MFTF-3.1–3.3. Existing single-item flows (original artwork buy-now, auction wins, Epic 14) are untouched._

### US-MFTF-12.1 — FulfillmentProvider Abstract Base Class

**As a** platform,
**I want** `FulfillmentProvider` converted from an interface to an abstract base class with a shared fulfillment template method,
**so that** every provider implementation — current and future — is structurally forced to implement the complete workflow.

**Acceptance Criteria:**
- [ ] `FulfillmentProvider` in `src/lib/fulfillment/` is an abstract class; all methods previously on the interface become abstract methods, plus abstract `quoteShipping(items, address)` introduced for checkout and abstract `checkFulfillmentStatus(fulfillmentOrder)` introduced for shipment-status detection (Prodigi implements it over its webhook path; Teemill implements it over polling `GET /orders/{orderRef}` — see US-MFTF-12.6). This keeps the polling-vs-webhook divergence inside the provider, not in order-processing code
- [ ] A concrete template method `fulfill(fulfillmentOrder)` on the base class orchestrates the shared flow (validate → create provider order → confirm) and is the only entry point order-processing code calls
- [ ] `TeemillFulfillmentProvider` and `ProdigiFulfillmentProvider` extend the base class; the provider registry/factory returns base-class-typed instances and is otherwise unchanged
- [ ] A provider subclass omitting any abstract method fails TypeScript compilation (verified by a type-level test fixture)
- [ ] All existing MFTF-3 tests pass unchanged — this is a structural refactor with no behavior change

**TDD Notes:**
- Test file: `__tests__/mftf-12-checkout-fulfillment/US-MFTF-12.1-provider-abstract-class.test.ts`
- **Touches Passed stories US-MFTF-3.1, 3.2, 3.3** — run their test files in the same session and flag in tracker notes
- Type-level test: `@ts-expect-error` fixture class missing an abstract method
- Unit test: `fulfill()` calls the abstract steps in order (spy on a test subclass)

---

### US-MFTF-12.2 — Multi-Item Order Schema

**As a** platform,
**I want** `OrderItem` and `FulfillmentOrder` models,
**so that** one buyer-facing order can contain multiple items split across multiple fulfillment providers.

**Acceptance Criteria:**
- [ ] `OrderItem` model: `id`, `orderId` (FK), `itemKind` (reusing `CartItemKind`), `apparelListingId` / `listingId` (nullable FKs, exactly one non-null), `selection` (Json), `quantity`, `unitPrice` (Decimal, captured at checkout creation), `fulfillmentOrderId` (nullable FK)
- [ ] `FulfillmentOrder` model: `id`, `orderId` (FK), `provider` (String — registry key), `providerOrderId` (nullable), `status` enum (`PENDING | SUBMITTED | CONFIRMED | SHIPPED | FAILED`), `shippingMethod`, `shippingCost` (Decimal), `trackingNumber` (nullable), `carrier` (nullable), `createdAt`, `updatedAt`
- [ ] Existing `Order` single-FK fields (`originalListingId`, `apparelListingId`) are retained; legacy flows (original buy-now, auction wins) continue to use them; cart checkouts create `OrderItem` rows instead and leave the single FKs null
- [ ] An application-layer invariant documents that an `Order` has either a single-listing FK or `OrderItem` rows, never both
- [ ] Schema applied via `prisma db push`; all existing Order-related tests pass unchanged

**TDD Notes:**
- Test file: `__tests__/mftf-12-checkout-fulfillment/US-MFTF-12.2-multi-item-order-schema.test.ts`
- Integration tests: create an Order with two OrderItems split across two FulfillmentOrders, query back with relations
- Regression: run Epic 14 / Epic 22 test files to confirm legacy order shape unaffected

---

### US-MFTF-12.3 — Checkout Creation: Cart Revalidation & Per-Provider Shipping

**As a** buyer,
**I want** my cart re-validated and shipping quoted when I start checkout,
**so that** I pay current prices and real shipping costs, and stale items are surfaced instead of silently failing.

**Acceptance Criteria:**
- [ ] `/checkout` requires authentication; unauthenticated buyers are redirected to login with a return-to parameter, and the guest cart survives via the US-MFTF-11.5 merge
- [ ] `createCheckoutAction` re-validates every cart item server-side. **Designed apparel:** listing ACTIVE, colour still offered, size still active, current `retailPrice`. **Referenced apparel:** listing ACTIVE, the selected `ReferencedVariant` still present and `isOrderable`, **live stock re-read > 0**, current `retailPrice` (USD — Teemill GBP base is never converted into the buyer total). **Print:** artwork listing active, print availability still enabled, fresh Prodigi quote
- [ ] Invalid or stale items are removed from the cart and reported back with human-readable reasons (e.g. "Solar Punk Bee tee in Moss is no longer available", "Powered By Plants tee in Evergreen is out of stock"); if anything was removed or any price changed, checkout pauses and the buyer must re-confirm before a Stripe session is created
- [ ] Valid items are grouped by fulfillment provider using a single provider-key resolution (`ProductType.fulfillmentProvider` for designed apparel; `ApparelListing.providerKey` for referenced apparel; Prodigi for prints); each group's shipping is quoted via that provider's `quoteShipping()` (Teemill: step 1 of the two-step Orders API, submitting cached `variantRef`s; Prodigi: quote endpoint), using the default/standard method
- [ ] Provider quotes are fetched in parallel (10s Vercel function limit). **Referenced-apparel live stock/price re-reads are batched into the same parallel phase**; if the rate-limit budget (see live-API confirmation note) makes synchronous live re-read unsafe, fall back to the cached snapshot plus a post-payment fulfillment-time stock check rather than blowing the function budget
- [ ] Checkout summary returned to the client shows line items at current prices, one shipping line per shipment group (provider names not exposed — "Shipment 1", "Shipment 2"), and the order total before tax

**TDD Notes:**
- Test file: `__tests__/mftf-12-checkout-fulfillment/US-MFTF-12.3-checkout-revalidation-shipping.test.ts`
- Unit tests: price drift detected; deactivated listing removed with reason; colour withdrawn removed with reason; **referenced variant out of stock removed with reason; referenced variant no longer `isOrderable` removed with reason**
- Integration test: mixed cart (designed apparel + referenced apparel + print) groups into three shipments with summed shipping
- MSW: Teemill `POST /orders` (shipping-methods response per the verified shapes in `/docs/teemill-api-notes.md`), Teemill `GET /catalog/products` for live stock re-read, Prodigi quote endpoint
- **Live-API confirmation flags (must resolve before Passed):** (1) Open Q#7 — how `shippingMethodId` is chosen at confirm time (always-standard vs. buyer-facing); this story assumes a stable "standard" method id, which must be confirmed live. (2) Rate limits unknown — confirm whether synchronous live stock/price re-reads for every referenced line item are safe inside the 10s function, or whether the cached-snapshot + fulfillment-time-check fallback path must be the default

---

### US-MFTF-12.4 — Multi-Line-Item Stripe Checkout Session

**As a** buyer,
**I want** to pay for my whole cart in one embedded Stripe checkout,
**so that** a multi-item, multi-shipment purchase is a single payment.

**Acceptance Criteria:**
- [ ] After re-confirmation (US-MFTF-12.3), one embedded Stripe Checkout session is created containing one Stripe line item per cart item (title, quantity, unit amount) plus one shipping line item per shipment group
- [ ] Stripe Tax is enabled on the session (consistent with existing checkout configuration)
- [ ] One `Order` (status `PENDING`) is created with `OrderItem` rows (capturing `unitPrice`) and `FulfillmentOrder` rows (status `PENDING`, with quoted `shippingMethod` / `shippingCost`) before the session is returned
- [ ] On Stripe webhook `checkout.session.completed`, the existing `fulfillPaymentBySession` path marks the Order `PAID` and empties the buyer's cart
- [ ] If the session expires or is abandoned, the `PENDING` Order remains inert and the cart is untouched
- [ ] Existing single-item checkout flows (original buy-now, auction win payment) continue to work unchanged

**TDD Notes:**
- Test file: `__tests__/mftf-12-checkout-fulfillment/US-MFTF-12.4-stripe-multi-line-checkout.test.ts`
- MSW: Stripe session creation — assert line-item payload shape (items + shipping lines)
- Integration tests: Order/OrderItem/FulfillmentOrder rows created before session; webhook marks PAID and clears cart
- Regression: Epic 21 tests pass unchanged

---

### US-MFTF-12.5 — Post-Payment Fulfillment Fan-Out

**As a** platform,
**I want** each shipment group dispatched through its fulfillment provider after payment,
**so that** a mixed order is fulfilled by the right suppliers automatically, with failures isolated per shipment.

**Acceptance Criteria:**
- [ ] When an Order transitions to `PAID`, each of its `FulfillmentOrder` rows is dispatched through `provider.fulfill()` (the US-MFTF-12.1 template method): Teemill — `POST /orders` then `POST /orders/{id}/confirm`; Prodigi — existing order creation path behind the abstraction
- [ ] On success, the `FulfillmentOrder` stores `providerOrderId` and moves to `CONFIRMED`
- [ ] A failure in one shipment does not block the others: the failed `FulfillmentOrder` moves to `FAILED` with the error recorded in its notes, sibling shipments proceed independently
- [ ] `FAILED` fulfillment orders surface in the admin fulfillment queue (Epic 14 / US-14.5 page) with a retry action that re-runs `fulfill()` for that shipment only
- [ ] Dispatch is idempotent per `FulfillmentOrder` — re-processing a webhook does not create duplicate provider orders

**TDD Notes:**
- Test file: `__tests__/mftf-12-checkout-fulfillment/US-MFTF-12.5-fulfillment-fanout.test.ts`
- MSW: Teemill two-step happy path; Teemill 500 on confirm (assert FAILED + sibling Prodigi shipment CONFIRMED)
- Integration tests: retry transitions FAILED → CONFIRMED; replayed dispatch is a no-op when providerOrderId already set

---

### US-MFTF-12.6 — Buyer Order View with Per-Shipment Status

**As a** buyer,
**I want** my multi-item order shown as one order with per-shipment progress and tracking,
**so that** I understand that my items may arrive separately without ever seeing supplier internals.

**Acceptance Criteria:**
- [ ] The post-payment confirmation page and the order detail page (Epic 22) display the order's items grouped by shipment ("Shipment 1 of 2"), each with its own status badge derived from the `FulfillmentOrder` status — provider/dropshipper names are never exposed to the buyer
- [ ] Each shipment shows estimated dispatch copy while `CONFIRMED` and tracking number + carrier once `SHIPPED`
- [ ] Shipment status is detected per provider via a `checkFulfillmentStatus()` step on the provider abstraction: **Prodigi** uses its existing webhook path; **Teemill** uses polling of `GET /orders/{orderRef}` (Teemill webhook support is **not confirmed** — no event names, payload, or registration mechanism verified). When a poll (or Prodigi webhook) reports dispatch with a tracking number, the corresponding `FulfillmentOrder` moves to `SHIPPED` with tracking + carrier stored. A `// TODO: replace Teemill polling with webhook once payload shape is confirmed live` marker is left in the Teemill path
- [ ] Teemill polling cadence respects the daily-cron constraint (Vercel Hobby) and the unknown rate limit; polling is a scheduled reconciliation, not a per-request live call
- [ ] A shipping confirmation email (MailerSend, existing transactional pattern) is sent per shipment when it transitions to `SHIPPED`, listing only that shipment's items and tracking link; the email path is identical regardless of how the status was detected (poll vs. webhook)
- [ ] Order history (`/buyer/orders`) shows one row per Order with an aggregate status ("Processing" until all shipments shipped, then "Shipped")

**TDD Notes:**
- Test file: `__tests__/mftf-12-checkout-fulfillment/US-MFTF-12.6-order-per-shipment-status.test.ts`
- Component tests: shipment grouping renders without provider names; aggregate status logic
- Integration tests: simulate a Teemill `GET /orders/{orderRef}` **poll** returning a dispatched fulfillment → one shipment SHIPPED, order remains "Processing" until the second shipment ships; Prodigi webhook path unchanged
- Email tests: MSW intercepts MailerSend per shipment; assert two emails for a two-shipment order
- MSW: Teemill `GET /orders/:orderRef` stub returning a dispatched/with-tracking shape (stubbed per `/docs/teemill-api-notes.md`; tracking field paths `// UNVERIFIED` until live confirmation)
- **Live-API confirmation flag (must resolve before Passed):** Open Q#2 — whether the Teemill Orders API supports webhooks at all, and if so the event names + payload (esp. tracking number + carrier fields). Until confirmed, polling is the shipped detection mechanism; the webhook is a later upgrade that must not change the email or status-transition contract
