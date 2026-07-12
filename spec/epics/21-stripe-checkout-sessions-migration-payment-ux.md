## Epic 21: Stripe Checkout Sessions Migration & Payment UX

### US-21.1 — Migrate Payment Collection to Stripe Checkout Sessions

**As a** platform,
**I want to** use Stripe's Checkout Sessions API (`ui_mode: "elements"`) instead of the Payment Intents API,
**so that** our integration follows Stripe's current recommended pattern and stays compatible with features like Adaptive Pricing.

**Acceptance Criteria:**
- The `/api/payment-intent` route is replaced by a `/api/checkout-session` route that creates a Stripe `Session` with `ui_mode: "elements"`, `line_items` derived from the order amount, and a `return_url` of `/orders/[orderId]/fulfill?session_id={CHECKOUT_SESSION_ID}`.
- `PaymentForm` is rewritten to use `CheckoutElementsProvider` (imported from `@stripe/react-stripe-js/checkout`) initialised with the session's `client_secret`, and confirms payment with `checkout.confirm()` rather than `stripe.confirmPayment()`.
- The Stripe webhook listener changes from handling `payment_intent.succeeded` to `checkout.session.completed`; `fulfillPayment` is updated to look up the order by the session's metadata `orderId` field.
- The `Order` model retains a `stripePaymentIntentId` column for historical records; new orders store the Checkout Session ID in a new `stripeSessionId` field (schema migration required).
- All existing payment tests are updated to reflect the new API; MSW intercepts are updated to include `/v1/checkout/sessions`.
- No change to the buyer-facing UI beyond what is required by the API swap.

### US-21.2 — Show Order Confirmation Immediately After Payment

**As a** buyer who has just paid,
**I want to** see a clear confirmation screen immediately after payment succeeds,
**so that** I am not left on a "Complete Your Order" screen with no indication that payment was accepted.

**Acceptance Criteria:**
- After `checkout.confirm()` succeeds on the client, the buyer is redirected to `/orders/[orderId]/fulfill?session_id=[id]`.
- The fulfillment page detects the `session_id` query parameter and calls a server-side helper (`resolveSessionFulfillment`) that verifies the session IDs match, retrieves the Stripe Session, verifies its `payment_status === "paid"`, and synchronously calls `fulfillPayment()` before rendering.
- If `fulfillPayment()` has already been called (idempotency guard), the helper exits cleanly without error.
- The fulfillment page uses a **payment-first** flow: the Stripe Checkout section is displayed before the shipping address form for all order types (auction wins, fixed-price originals, and prints).
- After payment succeeds (order status PAID), the page presents a shipping address form. Once the shipping address is submitted, the final confirmation view is shown.
- For print orders, the Prodigi fulfillment API call is made in `confirmShippingAction` (not at payment time) since shipping details are not yet available when payment is processed.
- If the session ID in the query param does not match the order's stored `stripeSessionId`, the helper no-ops safely.
- The webhook handler (`checkout.session.completed`) continues to function as a reliable fallback for cases where the redirect does not fire.
