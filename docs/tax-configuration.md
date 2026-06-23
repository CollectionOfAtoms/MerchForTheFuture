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

## Reporting

Tax collection reports live in the **Stripe Dashboard** (Tax → Reports, exportable as
CSV). The admin Tax page links there with a how-to and surfaces nexus-threshold
monitoring (US-5.3). We do not maintain a separate in-app tax report.
