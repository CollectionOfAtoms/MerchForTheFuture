import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { registerUser } from "@/lib/auth/registration";
import {
  createStripeConnectAccount,
  linkStripeAccountToUser,
  isSellerOnboarded,
} from "@/lib/auth/seller-onboarding";

// Stripe's Node SDK uses the native https module, not fetch, so we mock the module directly.
vi.mock("stripe", () => {
  class MockStripe {
    accounts = {
      create: vi.fn().mockResolvedValue({ id: "acct_test_mock", type: "express" }),
    };
  }
  return { default: MockStripe };
});

describe("US-6.3 — Seller Onboarding", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  describe("Unit: Stripe Connect account creation (MSW mocked)", () => {
    it("returns a Stripe account ID from the Stripe API", async () => {
      const accountId = await createStripeConnectAccount({
        email: "seller@example.com",
        name: "Test Seller",
      });

      expect(accountId).toBeDefined();
      expect(typeof accountId).toBe("string");
      expect(accountId.length).toBeGreaterThan(0);
    });
  });

  describe("Integration: linking Stripe account to user", () => {
    it("stores stripeAccountId on the user record", async () => {
      const user = await registerUser({
        email: "stripe-seller@example.com",
        password: "Password123!",
        name: "Stripe Seller",
      });

      await linkStripeAccountToUser(user.id, "acct_test_mock");

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.stripeAccountId).toBe("acct_test_mock");
    });

    it("throws if user does not exist", async () => {
      await expect(
        linkStripeAccountToUser("nonexistent-id", "acct_test_mock")
      ).rejects.toThrow(/not found|does not exist/i);
    });
  });

  describe("Integration: onboarding status check", () => {
    it("isSellerOnboarded returns false when stripeAccountId is null", async () => {
      const user = await registerUser({
        email: "not-onboarded@example.com",
        password: "Password123!",
        name: "Not Onboarded",
      });

      const result = await isSellerOnboarded(user.id);
      expect(result).toBe(false);
    });

    it("isSellerOnboarded returns true when stripeAccountId is set", async () => {
      const user = await registerUser({
        email: "onboarded@example.com",
        password: "Password123!",
        name: "Onboarded Seller",
      });

      await linkStripeAccountToUser(user.id, "acct_test_mock");

      const result = await isSellerOnboarded(user.id);
      expect(result).toBe(true);
    });

    it("isSellerOnboarded throws for unknown user", async () => {
      await expect(isSellerOnboarded("unknown-id")).rejects.toThrow(
        /not found|does not exist/i
      );
    });
  });
});
