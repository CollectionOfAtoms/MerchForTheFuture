import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

const { requestPasswordResetAction } = await import("@/app/actions/auth");

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("US-17.1 — Request Password Reset", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => {
    resetDatabase();
    vi.clearAllMocks();
  });

  async function seedUser(email = "user@test.com") {
    return prisma.user.create({
      data: { email, name: "Test User", passwordHash: "oldhash", roles: ["BUYER"] },
    });
  }

  // ── No enumeration ────────────────────────────────────────────────────────────

  it("returns success for an unregistered email (no enumeration)", async () => {
    const fd = makeFormData({ email: "nobody@test.com" });
    const result = await requestPasswordResetAction(undefined, fd);
    expect(result).not.toHaveProperty("error");
    expect((result as { success: true }).success).toBe(true);
  });

  it("does NOT create a token for an unregistered email", async () => {
    const fd = makeFormData({ email: "nobody@test.com" });
    await requestPasswordResetAction(undefined, fd);
    const tokens = await prisma.passwordResetToken.findMany({});
    expect(tokens).toHaveLength(0);
  });

  it("returns the same success response for a registered email", async () => {
    await seedUser("user@test.com");
    const fd = makeFormData({ email: "user@test.com" });
    const result = await requestPasswordResetAction(undefined, fd);
    expect(result).not.toHaveProperty("error");
    expect((result as { success: true }).success).toBe(true);
  });

  // ── Token creation ────────────────────────────────────────────────────────────

  it("creates a PasswordResetToken for a registered email", async () => {
    await seedUser("user@test.com");
    const fd = makeFormData({ email: "user@test.com" });
    await requestPasswordResetAction(undefined, fd);

    const token = await prisma.passwordResetToken.findFirst({ where: { email: "user@test.com" } });
    expect(token).not.toBeNull();
    expect(token!.used).toBe(false);
  });

  it("token expires approximately 1 hour from now", async () => {
    await seedUser("user@test.com");
    const fd = makeFormData({ email: "user@test.com" });
    const before = Date.now();
    await requestPasswordResetAction(undefined, fd);

    const token = await prisma.passwordResetToken.findFirst({ where: { email: "user@test.com" } });
    const expiresMs = token!.expires.getTime();
    expect(expiresMs).toBeGreaterThan(before + 55 * 60 * 1000);
    expect(expiresMs).toBeLessThan(before + 65 * 60 * 1000);
  });

  it("token is a non-empty string", async () => {
    await seedUser();
    const fd = makeFormData({ email: "user@test.com" });
    await requestPasswordResetAction(undefined, fd);

    const token = await prisma.passwordResetToken.findFirst({ where: { email: "user@test.com" } });
    expect(typeof token!.token).toBe("string");
    expect(token!.token.length).toBeGreaterThan(16);
  });

  // ── Previous token invalidation ───────────────────────────────────────────────

  it("issuing a second request invalidates the previous token", async () => {
    await seedUser();
    const fd = makeFormData({ email: "user@test.com" });

    await requestPasswordResetAction(undefined, fd);
    const first = await prisma.passwordResetToken.findFirst({ where: { email: "user@test.com" } });

    await requestPasswordResetAction(undefined, fd);
    const second = await prisma.passwordResetToken.findFirst({
      where: { email: "user@test.com" },
      orderBy: { createdAt: "desc" },
    });

    // Previous token should be marked used (or deleted), new token is different
    expect(second!.token).not.toBe(first!.token);

    const old = await prisma.passwordResetToken.findUnique({ where: { token: first!.token } });
    // Must either be gone or marked used
    expect(!old || old.used).toBe(true);
  });

  // ── Input validation ──────────────────────────────────────────────────────────

  it("returns error for a missing email", async () => {
    const fd = makeFormData({ email: "" });
    const result = await requestPasswordResetAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("returns error for an invalid email format", async () => {
    const fd = makeFormData({ email: "notanemail" });
    const result = await requestPasswordResetAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  // ── Email sending (MSW intercepts Resend) ─────────────────────────────────────

  it("sends a reset email for a registered user (Resend intercepted by MSW)", async () => {
    await seedUser("user@test.com");
    const fd = makeFormData({ email: "user@test.com" });
    // Should not throw — MSW intercepts the Resend POST
    await expect(requestPasswordResetAction(undefined, fd)).resolves.not.toHaveProperty("error");
  });
});
