## Epic 4: Payments (Credit Card to Business)

### US-4.1 — Pay by Credit Card
**As a** buyer,
**I want to** pay for my purchase with a credit card,
**so that** I can complete the transaction conveniently.

**Acceptance Criteria:**
- Checkout accepts major credit cards (Visa, Mastercard, Amex, Discover).
- Payment form collects card number, expiration, CVC, and billing address.
- Payment is processed through a PCI-compliant payment gateway (e.g., Stripe).

### US-4.2 — Secure Payment Processing
**As a** buyer,
**I want to** my payment to be processed securely,
**so that** my financial information is protected.

**Acceptance Criteria:**
- All payment data is transmitted over HTTPS/TLS.
- Card details are tokenized; raw card numbers are never stored on the platform.
- Payment gateway handles PCI DSS compliance.
- 3D Secure / SCA is supported where required by the buyer's region.

### US-4.3 — Seller Payouts
**As a** seller,
**I want to** payments to be deposited into my linked business account,
**so that** I receive the proceeds of my sales.

**Acceptance Criteria:**
- Seller connects a bank account or payout method during onboarding (e.g., Stripe Connect).
- After a successful sale, funds (minus platform fees) are transferred to the seller.
- Payout schedule is configurable (e.g., daily, weekly) or follows a default hold period.

### US-4.4 — Transaction Records
**As a** seller,
**I want to** see a clear record of each transaction (amount, fees, net payout),
**so that** I can track my revenue.

**Acceptance Criteria:**
- Seller dashboard shows a transaction history with: sale price, platform fee, payment processing fee, net payout, and date.
- Records are exportable as CSV.
- Each record links back to the associated listing.

### US-4.5 — Purchase Confirmation
**As a** buyer,
**I want to** receive a receipt or confirmation email after payment,
**so that** I have proof of purchase.

**Acceptance Criteria:**
- Buyer receives a confirmation email with: artwork title, price paid, taxes, total, order number, and seller info.
- A receipt is also viewable in the buyer's account under order history.
