import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { registerUser } from "@/lib/auth/registration";
import { verifyCredentials, recordFailedLogin, isAccountLocked } from "@/lib/auth/login";

describe("US-6.2 — Secure Login", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  describe("Unit: credential verification", () => {
    it("returns user for valid email + password", async () => {
      await registerUser({
        email: "valid@example.com",
        password: "Correct123!",
        name: "Valid User",
      });

      const result = await verifyCredentials("valid@example.com", "Correct123!");
      expect(result).not.toBeNull();
      expect(result?.email).toBe("valid@example.com");
    });

    it("returns null for wrong password", async () => {
      await registerUser({
        email: "wrongpass@example.com",
        password: "Correct123!",
        name: "User",
      });

      const result = await verifyCredentials("wrongpass@example.com", "Wrong123!");
      expect(result).toBeNull();
    });

    it("returns null for non-existent email", async () => {
      const result = await verifyCredentials("nobody@example.com", "Password123!");
      expect(result).toBeNull();
    });

    it("does not expose passwordHash in returned user object", async () => {
      await registerUser({
        email: "nohash@example.com",
        password: "Password123!",
        name: "User",
      });

      const result = await verifyCredentials("nohash@example.com", "Password123!");
      expect(result).not.toHaveProperty("passwordHash");
    });
  });

  describe("Unit: account lockout after repeated failures", () => {
    it("isAccountLocked returns false when failed attempts are below threshold", async () => {
      const user = await registerUser({
        email: "notlocked@example.com",
        password: "Password123!",
        name: "User",
      });

      await recordFailedLogin(user.email);
      await recordFailedLogin(user.email);

      const locked = await isAccountLocked(user.email);
      expect(locked).toBe(false);
    });

    it("isAccountLocked returns true after 5 consecutive failed attempts", async () => {
      const user = await registerUser({
        email: "locked@example.com",
        password: "Password123!",
        name: "User",
      });

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(user.email);
      }

      const locked = await isAccountLocked(user.email);
      expect(locked).toBe(true);
    });

    it("verifyCredentials returns null when account is locked, even with correct password", async () => {
      await registerUser({
        email: "lockedlogin@example.com",
        password: "Password123!",
        name: "User",
      });

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin("lockedlogin@example.com");
      }

      const result = await verifyCredentials("lockedlogin@example.com", "Password123!");
      expect(result).toBeNull();
    });
  });
});
