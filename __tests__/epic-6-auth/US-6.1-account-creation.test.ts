import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import {
  registerUser,
  hashPassword,
  verifyEmailToken,
} from "@/lib/auth/registration";

describe("US-6.1 — Account Creation", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  describe("Unit: registration logic", () => {
    it("hashes password before storing — raw password never returned", async () => {
      const hash = await hashPassword("SuperSecret123!");
      expect(hash).not.toBe("SuperSecret123!");
      expect(hash.length).toBeGreaterThan(20);
    });

    it("produces a different hash each call (salted)", async () => {
      const h1 = await hashPassword("same-password");
      const h2 = await hashPassword("same-password");
      expect(h1).not.toBe(h2);
    });
  });

  describe("Integration: user creation in database", () => {
    it("always assigns the BUYER role regardless of any other input", async () => {
      const user = await registerUser({
        email: "buyer@example.com",
        password: "Password123!",
        name: "Test Buyer",
      });

      expect(user.roles).toEqual(["BUYER"]);
    });

    it("never assigns SELLER or ADMIN role through web registration", async () => {
      const user = await registerUser({
        email: "attempted-escalation@example.com",
        password: "Password123!",
        name: "Sneaky User",
      });

      expect(user.roles).not.toContain("SELLER");
      expect(user.roles).not.toContain("ADMIN");
    });

    it("does not return passwordHash in the result", async () => {
      const user = await registerUser({
        email: "safe@example.com",
        password: "Password123!",
        name: "Safe User",
      });

      expect(user).not.toHaveProperty("passwordHash");
    });

    it("emailVerified is null until verified", async () => {
      const user = await registerUser({
        email: "unverified@example.com",
        password: "Password123!",
        name: "Unverified",
      });

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.emailVerified).toBeNull();
    });

    it("rejects duplicate email addresses", async () => {
      await registerUser({
        email: "dup@example.com",
        password: "Password123!",
        name: "First",
      });

      await expect(
        registerUser({
          email: "dup@example.com",
          password: "Other123!",
          name: "Second",
        })
      ).rejects.toThrow(/already registered|duplicate|unique/i);
    });

    it("rejects missing email", async () => {
      await expect(
        registerUser({ email: "", password: "Password123!", name: "X" })
      ).rejects.toThrow(/email/i);
    });

    it("rejects missing password", async () => {
      await expect(
        registerUser({ email: "a@b.com", password: "", name: "X" })
      ).rejects.toThrow(/password/i);
    });
  });

  describe("Integration: email verification", () => {
    it("marks emailVerified after valid token is consumed", async () => {
      const user = await registerUser({
        email: "verify@example.com",
        password: "Password123!",
        name: "Verify Me",
      });

      const token = await prisma.verificationToken.create({
        data: {
          identifier: user.email,
          token: "valid-test-token",
          expires: new Date(Date.now() + 1000 * 60 * 60),
        },
      });

      await verifyEmailToken(token.identifier, token.token);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.emailVerified).not.toBeNull();
    });

    it("rejects an expired verification token", async () => {
      const user = await registerUser({
        email: "expired@example.com",
        password: "Password123!",
        name: "Expired",
      });

      await prisma.verificationToken.create({
        data: {
          identifier: user.email,
          token: "expired-token",
          expires: new Date(Date.now() - 1000),
        },
      });

      await expect(
        verifyEmailToken(user.email, "expired-token")
      ).rejects.toThrow(/expired/i);
    });

    it("rejects an invalid verification token", async () => {
      const user = await registerUser({
        email: "bad-token@example.com",
        password: "Password123!",
        name: "Bad Token",
      });

      await expect(
        verifyEmailToken(user.email, "wrong-token")
      ).rejects.toThrow(/invalid|not found/i);
    });
  });
});
