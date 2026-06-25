# Tax Configuration (Stripe Tax)

_Epic 5 — US-5.1. This document is referenced by the US-5.1 acceptance criteria._

Merch for the Future calculates, displays, and reports sales tax / VAT / GST using
**Stripe Tax**, natively inside our existing Stripe Checkout + Payments stack. We do
**not** use a separate tax service (TaxJar/Avalara). Stripe Tax calculates and reports
but **does not file** — filing in jurisdictions where we have a collection obligation
is a manual responsibility (or one delegated to a CPA), and whether we have nexus in a
given jurisdiction is a human/legal determination, not something Stripe decides for us.

## How it is wired in code

- **Per-line tax data.** Every Stripe Checkout line carries a `tax_behavior` and the
  product carries a `tax_code` — required for `automatic_tax` to compute. Constants live
  in [`src/lib/tax/codes.ts`](../src/lib/tax/codes.ts):
  - Items → `txcd_99999999` ("General - Tangible Goods"). Everything we sell (apparel,
    fine-art prints, originals) is tangible goods.
  - Shipping lines → `txcd_92010001` ("Shipping").
  - `tax_behavior: "exclusive"` — all store prices are entered tax-exclusive; the buyer's
    tax is added on top at checkout.
- **Address collection.** Sessions set `billing_address_collection: "required"` so Stripe
  can resolve the buyer's taxing jurisdiction. Cart checkout also collects the shipping
  address; an attached Customer (US-5.2) lets Stripe reuse the saved address.
- **`automatic_tax` toggle.** Both checkout entry points
  ([`src/lib/checkout/session.ts`](../src/lib/checkout/session.ts) cart flow and
  [`src/lib/payments/stripe.ts`](../src/lib/payments/stripe.ts) legacy buy-now) enable
  `automatic_tax` via `isStripeTaxEnabled()`.
- **Display before confirmation.** When enabled, Stripe's embedded Checkout renders the
  computed tax line before the buyer confirms payment.
- **Persistence + receipt.** On fulfillment we read the paid session's
  `total_details.amount_tax` / `breakdown` and write `Order.taxAmount`, `Order.taxRate`,
  `Order.taxJurisdiction`, and the true charged `Order.totalAmount`
  ([`src/lib/payments/webhook.ts`](../src/lib/payments/webhook.ts)). The itemized tax
  breakdown (rate, jurisdiction, amount) appears on the Stripe-generated receipt; the
  order confirmation page shows a subtotal/tax/total summary.

## The `STRIPE_TAX_ENABLED` flag (default OFF)

`automatic_tax` is gated behind the `STRIPE_TAX_ENABLED` environment variable.

| Value | Behavior |
|---|---|
| `STRIPE_TAX_ENABLED=true` | Stripe Tax is **on** — tax is computed, displayed, charged, and persisted. |
| unset / anything else | Stripe Tax is **off** — checkout proceeds with no tax line (`Order.taxAmount` stays 0). This is the default pre-launch posture. |

> To turn tax **on**, set `STRIPE_TAX_ENABLED=true`. You never set it to `false` to enable
> it — "default off" simply means tax is off when the variable is unset.

**Do not enable in production until the Stripe Dashboard is configured** (below), or live
checkout calls will fail. The flag exists so the code paths can ship and be tested ahead
of the manual Dashboard setup, and as a kill-switch.

## Required Stripe Dashboard setup (manual, before going live)

These are one-time human steps in the Stripe Dashboard — they cannot be done from code:

1. **Enable Stripe Tax** (Dashboard → Tax) and set the **origin address** (where the
   business ships/operates from).
2. **Add tax registrations** for every jurisdiction where we have determined we have a
   collection obligation (Dashboard → Tax → Registrations). Stripe only collects tax for
   jurisdictions where a registration exists.
3. Confirm product tax codes match what the code sends (general tangible goods + shipping).

## Behavior in unregistered jurisdictions

For a buyer in a jurisdiction where we have **not** added a registration, Stripe Tax
follows the configured behavior in the Dashboard. Our policy:

- **Do not collect** tax where we are not registered (the Stripe default). We only collect
  where we have a registration and a determined obligation.

This avoids collecting tax we have no authority to remit. Revisit per jurisdiction as the
business approaches nexus thresholds — see nexus monitoring (US-5.3, admin Tax page).

## Troubleshooting — "the tax line shows $0"

A $0 tax line is usually **correct** (we only collect where registered), but if you
expect a non-zero amount and still see $0, work through this list:

1. **Is there a registration for that jurisdiction?** Stripe Tax returns $0 for any
   jurisdiction where you have **no** registration. Add one under Dashboard → Tax →
   Registrations. Oregon, Montana, New Hampshire, Delaware, and Alaska have **no state
   sales tax** — they will always be $0.

0. **Tax is computed on the SHIPPING destination, not billing.** Physical goods are taxed
   where they ship **to**. We sync the address collected in our own checkout form onto the
   Stripe Customer's *shipping* address, and Stripe taxes that. So a buyer who lives in
   Oregon (no sales tax) gets `$0` / `not_subject_to_tax` **even if they type a Washington
   billing address into the Stripe payment form** — billing doesn't change the destination.
   To see WA tax, the **shipping** address (our checkout form's address) must be in WA.
   The `[tax-debug]` echo logs both `billingAddress` and `taxDestinationAddress` so you can
   tell which is which.
2. **Test vs live mode must match.** The registration must exist in the **same mode** as
   the `STRIPE_SECRET_KEY` the app uses. Test-mode registrations only affect test-mode
   sessions (the embedded form shows a "TEST" badge).
3. **Origin address set?** Dashboard → Tax → Settings must have an origin address, or
   Stripe can't compute.
4. **Which address Stripe taxes:**
   - **Cart checkout** pre-fills Stripe from the address the buyer enters in our own
     checkout form: we ensure a Stripe **Customer** and sync that address onto it
     (`ensureBuyerStripeCustomerWithAddress`, `src/lib/tax/customer.ts`), then attach the
     Customer to the session with `customer_update`. The Stripe form shows the address
     pre-filled and editable; Stripe Tax computes from it. So the address you typed in our
     form is what's taxed (unless the buyer edits it in the Stripe form).
   - **Legacy buy-now** (`createCheckoutSession`) collects the address **inside the Stripe
     iframe** (`billing_address_collection: "required"`) because that flow gathers shipping
     after payment — so for buy-now, enter a complete registered-state address in the Stripe
     form, e.g. `1301 5th Ave, Seattle, WA 98101`.
5. **Tax updates live as the address is completed.** $0 before a full, valid address is
   present is expected; it updates once state + ZIP are set (pre-filled for cart checkout).

### Echoing what Stripe actually used

Set `DROPSHIPPING_DEBUG=1` and complete a test checkout (card `4242 4242 4242 4242`).
On the confirmation/webhook path we log a `[tax-debug] stripe session tax` line with the
billing address Stripe used, `automaticTax` status, and the computed tax cents
(`src/lib/payments/webhook.ts` → `logTaxDebug`). The most useful field is
**`automaticTax`**:

- `complete` — Stripe computed tax for the address.
- `requires_location_inputs` — the address was missing/incomplete, so tax is $0. This is
  the typical cause of an unexpected $0: the in-iframe billing address wasn't a complete
  address in a registered state.
- `failed` — a configuration error (e.g. missing origin address).

> Note: for cart checkout the address is synced onto the Stripe Customer before the session
> is created (so it's pre-filled); for buy-now the buyer enters it inside the Stripe form.
> Either way the echo reads the address Stripe actually used after the session is retrieved.

## Reporting

Tax collection reports live in the **Stripe Dashboard** (Tax → Reports, exportable as
CSV). The admin Tax page links there with a how-to and surfaces nexus-threshold
monitoring (US-5.3). We do not maintain a separate in-app tax report.
