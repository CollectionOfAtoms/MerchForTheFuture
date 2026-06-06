import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { updateUserRolesAction } = await import("@/app/actions/admin");
const { auth } = await import("@/auth");

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedAdmin() {
  return prisma.user.create({
    data: { email: "admin16@test.com", name: "Admin", passwordHash: "x", roles: ["ADMIN", "BUYER"] as never },
  });
}

async function seedBuyer(tag = "a") {
  return prisma.user.create({
    data: { email: `buyer16-${tag}@test.com`, name: "Buyer", passwordHash: "x", roles: ["BUYER"] as never },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-16.3 — Admin user role elevation", () => {
  beforeEach(() => resetDatabase());
  afterEach(async () => { await resetDatabase(); vi.clearAllMocks(); });

  it("admin can grant SELLER role to a buyer", async () => {
    const admin = await seedAdmin();
    const buyer = await seedBuyer();
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN", "BUYER"] } } as never);

    const result = await updateUserRolesAction(buyer.id, ["BUYER", "SELLER"]);

    expect(result).not.toHaveProperty("error");
    const updated = await prisma.user.findUnique({ where: { id: buyer.id } });
    expect(updated!.roles).toContain("SELLER");
    expect(updated!.roles).toContain("BUYER");
  });

  it("admin can grant ADMIN role to a user", async () => {
    const admin = await seedAdmin();
    const buyer = await seedBuyer();
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN", "BUYER"] } } as never);

    const result = await updateUserRolesAction(buyer.id, ["BUYER", "ADMIN"]);

    expect(result).not.toHaveProperty("error");
    const updated = await prisma.user.findUnique({ where: { id: buyer.id } });
    expect(updated!.roles).toContain("ADMIN");
  });

  it("admin can revoke SELLER role", async () => {
    const admin = await seedAdmin();
    const seller = await prisma.user.create({
      data: { email: "seller16r@test.com", name: "Seller", passwordHash: "x", roles: ["BUYER", "SELLER"] as never },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN", "BUYER"] } } as never);

    const result = await updateUserRolesAction(seller.id, ["BUYER"]);

    expect(result).not.toHaveProperty("error");
    const updated = await prisma.user.findUnique({ where: { id: seller.id } });
    expect(updated!.roles).not.toContain("SELLER");
    expect(updated!.roles).toContain("BUYER");
  });

  it("rejects unauthenticated callers", async () => {
    const buyer = await seedBuyer();
    vi.mocked(auth).mockResolvedValue(null);

    const result = await updateUserRolesAction(buyer.id, ["BUYER", "SELLER"]);

    expect(result).toEqual({ error: "Unauthorized." });
    const unchanged = await prisma.user.findUnique({ where: { id: buyer.id } });
    expect(unchanged!.roles).not.toContain("SELLER");
  });

  it("rejects non-admin callers", async () => {
    const buyer = await seedBuyer("a");
    const other = await seedBuyer("b");
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, roles: ["BUYER"] } } as never);

    const result = await updateUserRolesAction(buyer.id, ["BUYER", "SELLER"]);

    expect(result).toEqual({ error: "Unauthorized." });
  });

  it("rejects roles that would remove BUYER from the target", async () => {
    const admin = await seedAdmin();
    const buyer = await seedBuyer();
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN", "BUYER"] } } as never);

    const result = await updateUserRolesAction(buyer.id, ["SELLER"]);

    expect(result).toEqual({ error: "BUYER role cannot be removed." });
  });

  it("rejects unknown role values", async () => {
    const admin = await seedAdmin();
    const buyer = await seedBuyer();
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN", "BUYER"] } } as never);

    const result = await updateUserRolesAction(buyer.id, ["BUYER", "SUPERUSER"] as never);

    expect(result).toEqual({ error: "Invalid roles." });
  });

  it("returns error when target user does not exist", async () => {
    const admin = await seedAdmin();
    vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN", "BUYER"] } } as never);

    const result = await updateUserRolesAction("nonexistent-id", ["BUYER", "SELLER"]);

    expect(result).toEqual({ error: "User not found." });
  });
});
