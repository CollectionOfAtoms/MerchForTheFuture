## Epic 6: User Accounts & Authentication

### US-6.1 — Account Creation
**As a** visitor,
**I want to** create an account (as a buyer, seller, or both),
**so that** I can use the platform.

**Acceptance Criteria:**
- Registration via email/password or OAuth (Google, Apple).
- User selects role(s) during signup: buyer, seller, or both.
- Email verification is required before full access.

### US-6.2 — Secure Login
**As a** user,
**I want to** log in securely,
**so that** my account and data are protected.

**Acceptance Criteria:**
- Login via email/password or OAuth.
- Optional two-factor authentication (TOTP or SMS).
- Account lockout after repeated failed attempts.
- Session timeout after period of inactivity.

### US-6.3 — Seller Onboarding
**As a** seller,
**I want to** connect my business bank account or payout method during onboarding,
**so that** I can receive funds.

**Acceptance Criteria:**
- Guided onboarding flow for sellers to connect a payout method (e.g., Stripe Connect onboarding).
- Seller provides required business information (name, address, tax ID).
- Payout method is verified before the seller can publish listings.

### US-6.4 — Email Verification
**As a** new user,
**I want to** verify my email address,
**so that** my account is confirmed and I can receive transactional email.

**Acceptance Criteria:**
- On registration, a verification email is sent to the supplied address.
- The email contains a unique, expiring verification link.
- Following the link marks the account's email as verified.
- Unverified accounts are handled per the app's access rules until verification completes.

_Status: Passed (tracker). Added to spec 2026-06-25 to reconcile spec with tracker._
