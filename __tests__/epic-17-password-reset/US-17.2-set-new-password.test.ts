import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { verifyPassword } from "@/lib/auth/registration";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

const { resetPasswordAction } = await import("@/app/actions/auth");

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("US-17.2 — Set New Password via Reset Link", () => {
  let userId: string;
  let userEmail: string;

  beforeEach(async () => {
    await resetDatabase();
    userEmail = "reset@test.com";
    const user = await prisma.user.create({
      data: { email: userEmail, name: "Reset User", passwordHash: "oldhash", roles: ["BUYER"] },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  async function createToken(opts: { used?: boolean; expiresOffset?: number } = {}) {
    const { used = false, expiresOffset = 60 * 60 * 1000 } = opts;
    return prisma.passwordResetToken.create({
      data: {
        token: `test-token-${Math.random().toString(36).slice(2)}`,
        email: userEmail,
        expires: new Date(Date.now() + expiresOffset),
        used,
      },
    });
  }

  // ── Success path ──────────────────────────────────────────────────────────────

  it("updates the user's password hash on valid token", async () => {
    const { token } = await createToken();
    const fd = makeFormData({ token, password: "newpassword123", confirm: "newpassword123" });
    // Action redirects on success — catch the throw so we can inspect DB state
    await resetPasswordAction(undefined, fd).catch((e) => {
      if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT")) throw e;
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isValid = await verifyPassword("newpassword123", user!.passwordHash!);
    expect(isValid).toBe(true);
  });

  it("marks the token as used after a successful reset", async () => {
    const { token } = await createToken();
    const fd = makeFormData({ token, password: "newpassword123", confirm: "newpassword123" });
    await resetPasswordAction(undefined, fd).catch((e) => {
      if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT")) throw e;
    });

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    expect(record!.used).toBe(true);
  });

  it("redirects to /sign-in after a successful reset", async () => {
    const { token } = await createToken();
    const fd = makeFormData({ token, password: "newpassword123", confirm: "newpassword123" });
    await expect(resetPasswordAction(undefined, fd)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });

  // ── Token validation ──────────────────────────────────────────────────────────

  it("returns error for a missing token", async () => {
    const fd = makeFormData({ token: "", password: "newpassword123", confirm: "newpassword123" });
    const result = await resetPasswordAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("returns error for an unknown token", async () => {
    const fd = makeFormData({ token: "does-not-exist", password: "newpassword123", confirm: "newpassword123" });
    const result = await resetPasswordAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("returns error for an expired token", async () => {
    const { token } = await createToken({ expiresOffset: -1000 }); // 1 second in the past
    const fd = makeFormData({ token, password: "newpassword123", confirm: "newpassword123" });
    const result = await resetPasswordAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("returns error for an already-used token", async () => {
    const { token } = await createToken({ used: true });
    const fd = makeFormData({ token, password: "newpassword123", confirm: "newpassword123" });
    const result = await resetPasswordAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("does not update password when token is invalid", async () => {
    const fd = makeFormData({ token: "bad-token", password: "newpassword123", confirm: "newpassword123" });
    await resetPasswordAction(undefined, fd);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user!.passwordHash).toBe("oldhash");
  });

  // ── Password validation ───────────────────────────────────────────────────────

  it("returns error when passwords do not match", async () => {
    const { token } = await createToken();
    const fd = makeFormData({ token, password: "newpassword123", confirm: "differentpassword" });
    const result = await resetPasswordAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("returns error when password is shorter than 8 characters", async () => {
    const { token } = await createToken();
    const fd = makeFormData({ token, password: "short", confirm: "short" });
    const result = await resetPasswordAction(undefined, fd);
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("accepts exactly 8 character passwords", async () => {
    const { token } = await createToken();
    const fd = makeFormData({ token, password: "exactly8", confirm: "exactly8" });
    await expect(resetPasswordAction(undefined, fd)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });

  // ── Single-use enforcement ────────────────────────────────────────────────────

  it("cannot reuse the same token twice", async () => {
    const { token } = await createToken();
    const fd = makeFormData({ token, password: "newpassword123", confirm: "newpassword123" });

    await expect(resetPasswordAction(undefined, fd)).rejects.toThrow("NEXT_REDIRECT:/sign-in");

    const fd2 = makeFormData({ token, password: "anotherpassword", confirm: "anotherpassword" });
    const result = await resetPasswordAction(undefined, fd2);
    expect((result as { error: string }).error).toBeTruthy();
  });
});
