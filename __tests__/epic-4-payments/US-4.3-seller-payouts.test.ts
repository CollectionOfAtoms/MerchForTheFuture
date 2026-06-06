import { describe, it } from "vitest";

// US-4.3 — Seller Payouts (via Stripe Connect) is DEFERRED.
// The curated store model has a single privileged seller; Stripe Connect
// onboarding (US-6.3) was dropped in favour of manual payout handling.
// Tests will be added when multi-seller support is introduced.

describe("US-4.3 — Seller Payouts (Deferred)", () => {
  it.todo("seller connects bank account via Stripe Connect");
  it.todo("funds minus platform fee are transferred after a sale");
  it.todo("payout schedule is configurable");
});
