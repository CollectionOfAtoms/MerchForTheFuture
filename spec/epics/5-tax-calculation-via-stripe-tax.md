## Epic 5: Tax Calculation (via Stripe Tax)

_This epic uses **Stripe Tax** rather than a separate tax service like TaxJar or Avalara. Stripe Tax is enabled directly in the Stripe Dashboard and integrates natively with our existing Stripe Checkout / Payments flow, so tax calculation, display, and reporting happen inside the same payment stack we already use. Stripe Tax handles US sales tax, EU/UK VAT, GST in CA/AU/NZ/SG, and a growing list of other jurisdictions. It also tracks nexus thresholds and warns when we approach them in a new jurisdiction._

_**Important:** Stripe Tax calculates and reports — it does **not** file taxes for us. Filing in jurisdictions where we have collection obligations remains a manual responsibility (or one delegated to a CPA). Stripe Tax is also not a substitute for legal/accounting advice on whether we have nexus in a given jurisdiction; that determination is a human decision._

### US-5.1 — Auto-Calculate Tax by Buyer Location (Stripe Tax)
**As a** buyer,
**I want to** see accurate tax applied to my purchase based on my location,
**so that** I know my total cost and the transaction is legally compliant.

**Acceptance Criteria:**
- Stripe Tax is enabled on the Stripe account and active for all Checkout / Payment Intent flows.
- Tax is calculated server-side by Stripe based on the buyer's shipping or billing address.
- Applicable tax types are handled automatically by Stripe: US sales tax, EU/UK VAT, GST (CA/AU/NZ/SG), and other supported jurisdictions.
- Tax amount and rate are displayed during checkout before payment confirmation.
- Tax breakdown (rate, jurisdiction, amount) is included on the Stripe-generated receipt.
- For buyers in jurisdictions where the platform has not registered for tax collection, Stripe Tax follows the configured behavior (e.g., do not collect, or collect and remit) — the configuration is documented in `/docs/tax-configuration.md`.

### US-5.2 — Tax-Exempt Handling
**As a** buyer with tax-exempt status (e.g., a registered nonprofit or reseller),
**I want to** apply my exemption to a purchase,
**so that** I am not charged tax on qualifying purchases.

**Acceptance Criteria:**
- Buyer can upload a tax-exempt certificate (PDF or image) from their account settings.
- Admin reviews and approves the certificate before exempt status is granted.
- Once approved, the buyer's Stripe Customer record is updated with the appropriate tax exemption status (`exempt` or `reverse`) via the Stripe API.
- Stripe Tax automatically applies the exemption at checkout for that customer.
- Transaction records show the exemption applied and reference the certificate on file.

### US-5.3 — Tax Reporting via Stripe Dashboard
**As an** admin,
**I want to** access tax collection reports for filing purposes,
**so that** I can file accurate tax returns in jurisdictions where the platform has obligations.

**Acceptance Criteria:**
- Tax collection reports are accessed through the Stripe Dashboard (Stripe Tax > Reports), exportable as CSV.
- The admin dashboard includes a link to the Stripe Tax reports section with a brief explanation of how to use it.
- Stripe Tax's nexus monitoring is enabled; the admin is notified (via Stripe and surfaced on the admin dashboard) when the platform approaches or crosses a registration threshold in a new jurisdiction.
- For sellers operating under Stripe Connect, individual seller tax reports follow Stripe Connect's standard reporting (1099-K for eligible US sellers is generated automatically by Stripe).

### US-5.4 — Multi-Currency Display
**As a** buyer,
**I want to** see prices and taxes in my local currency,
**so that** I understand the total cost without manual conversion.

**Acceptance Criteria:**
- Buyer's currency is auto-detected from location at first visit and can be overridden in account preferences.
- Prices on listing pages are displayed in the buyer's local currency, with the seller's listing currency shown as secondary information.
- At checkout, Stripe handles the actual currency conversion and charge; the receipt documents both the charged currency and the conversion rate used.
- Exchange rates for display purposes are refreshed at least daily from a reliable source (e.g., Stripe's exchange rate API or an FX service).
