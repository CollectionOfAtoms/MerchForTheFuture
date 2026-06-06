import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import {
  registerUser,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
} from "@/lib/auth/registration";
import { sendVerificationEmail } from "@/lib/payments/email";
import { resendVerificationEmailAction } from "@/app/actions/auth";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("US-6.4 — Email Verification", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  // ─── Token creation ──────────────────────────────────────────────────────────

  describe("createEmailVerificationToken", () => {
    it("returns a non-empty token string", async () => {
      await registerUser({ email: "a@example.com", password: "Password1!", name: "A" });
      const token = await createEmailVerificationToken("a@example.com");
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(16);
    });

    it("persists a record with 24-hour expiry", async () => {
      await registerUser({ email: "b@example.com", password: "Password1!", name: "B" });
      const token = await createEmailVerificationToken("b@example.com");

      const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
      expect(record).not.toBeNull();
      expect(record!.email).toBe("b@example.com");
      expect(record!.used).toBe(false);

      const msUntilExpiry = record!.expires.getTime() - Date.now();
      expect(msUntilExpiry).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(msUntilExpiry).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
    });

    it("each call produces a unique token", async () => {
      await registerUser({ email: "c@example.com", password: "Password1!", name: "C" });
      const t1 = await createEmailVerificationToken("c@example.com");
      const t2 = await createEmailVerificationToken("c@example.com");
      expect(t1).not.toBe(t2);
    });
  });

  // ─── Token consumption ───────────────────────────────────────────────────────

  describe("consumeEmailVerificationToken", () => {
    it("sets emailVerified on the user and marks the token used", async () => {
      const user = await registerUser({ email: "verify@example.com", password: "Password1!", name: "V" });
      const token = await createEmailVerificationToken("verify@example.com");

      await consumeEmailVerificationToken(token);

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.emailVerified).not.toBeNull();

      const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
      expect(record?.used).toBe(true);
    });

    it("throws on an expired token", async () => {
      const user = await registerUser({ email: "expired@example.com", password: "Password1!", name: "E" });
      await prisma.emailVerificationToken.create({
        data: {
          token: "expired-tok",
          email: user.email,
          expires: new Date(Date.now() - 1000),
        },
      });

      await expect(consumeEmailVerificationToken("expired-tok")).rejects.toThrow(/expired/i);
    });

    it("throws on an already-used token", async () => {
      const user = await registerUser({ email: "used@example.com", password: "Password1!", name: "U" });
      await prisma.emailVerificationToken.create({
        data: {
          token: "used-tok",
          email: user.email,
          expires: new Date(Date.now() + 60_000),
          used: true,
        },
      });

      await expect(consumeEmailVerificationToken("used-tok")).rejects.toThrow(/already used/i);
    });

    it("throws on an invalid (non-existent) token", async () => {
      await expect(consumeEmailVerificationToken("no-such-token")).rejects.toThrow(/invalid/i);
    });

    it("does not set emailVerified when token is expired", async () => {
      const user = await registerUser({ email: "no-verify@example.com", password: "Password1!", name: "NV" });
      await prisma.emailVerificationToken.create({
        data: {
          token: "expired-no-verify",
          email: user.email,
          expires: new Date(Date.now() - 1000),
        },
      });

      await expect(consumeEmailVerificationToken("expired-no-verify")).rejects.toThrow();

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.emailVerified).toBeNull();
    });
  });

  // ─── Email sending ───────────────────────────────────────────────────────────

  describe("sendVerificationEmail", () => {
    it("sends without throwing (MSW intercepts Resend)", async () => {
      await expect(
        sendVerificationEmail("test@example.com", "some-token", "Test User")
      ).resolves.not.toThrow();
    });

    it("works without a name argument", async () => {
      await expect(
        sendVerificationEmail("anon@example.com", "anon-token")
      ).resolves.not.toThrow();
    });
  });

  // ─── Resend action ───────────────────────────────────────────────────────────

  describe("resendVerificationEmailAction", () => {
    it("creates a new token and returns success", async () => {
      await registerUser({ email: "resend@example.com", password: "Password1!", name: "R" });

      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValue({
        user: { email: "resend@example.com" },
      } as Awaited<ReturnType<typeof auth>>);

      const result = await resendVerificationEmailAction(undefined, new FormData());
      expect(result).toEqual({ success: true });

      const tokens = await prisma.emailVerificationToken.findMany({
        where: { email: "resend@example.com", used: false },
      });
      expect(tokens.length).toBeGreaterThanOrEqual(1);
    });

    it("invalidates existing unused tokens before creating a new one", async () => {
      await registerUser({ email: "invalidate@example.com", password: "Password1!", name: "I" });

      // Seed an old unused token (more than 60s ago to avoid rate limit)
      await prisma.emailVerificationToken.create({
        data: {
          token: "old-unused-token",
          email: "invalidate@example.com",
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 90_000),
        },
      });

      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValue({
        user: { email: "invalidate@example.com" },
      } as Awaited<ReturnType<typeof auth>>);

      await resendVerificationEmailAction(undefined, new FormData());

      const old = await prisma.emailVerificationToken.findUnique({
        where: { token: "old-unused-token" },
      });
      expect(old?.used).toBe(true);
    });

    it("rate-limits: returns error if a token was created within the last 60 seconds", async () => {
      await registerUser({ email: "ratelimit@example.com", password: "Password1!", name: "RL" });

      // Seed a recently-created token
      await prisma.emailVerificationToken.create({
        data: {
          token: "recent-token",
          email: "ratelimit@example.com",
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 10_000),
        },
      });

      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValue({
        user: { email: "ratelimit@example.com" },
      } as Awaited<ReturnType<typeof auth>>);

      const result = await resendVerificationEmailAction(undefined, new FormData());
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/wait/i);
    });

    it("returns error when no session is present", async () => {
      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValue(null);

      const result = await resendVerificationEmailAction(undefined, new FormData());
      expect(result).toHaveProperty("error");
    });

    it("returns error when user is already verified", async () => {
      await registerUser({ email: "already@example.com", password: "Password1!", name: "AV" });
      await prisma.user.update({
        where: { email: "already@example.com" },
        data: { emailVerified: new Date() },
      });

      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValue({
        user: { email: "already@example.com" },
      } as Awaited<ReturnType<typeof auth>>);

      const result = await resendVerificationEmailAction(undefined, new FormData());
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/already verified/i);
    });
  });
});
