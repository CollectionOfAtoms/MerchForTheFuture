import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { updateProfileAction, updateSellerNotificationPrefsAction } = await import("@/app/actions/account");
const { auth } = await import("@/auth");
const { revalidatePath } = await import("next/cache");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createUser(email: string, roles: string[]) {
  return prisma.user.create({
    data: { email, name: "Test User", passwordHash: "hash", roles },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-23.1 — Seller & Admin Settings", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  // ─── updateProfileAction path revalidation ───────────────────────────────────

  describe("updateProfileAction — revalidates all settings paths", () => {
    it("revalidates /seller/settings after a seller updates their profile", async () => {
      const seller = await createUser("seller@test.com", ["SELLER"]);
      vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

      const form = new FormData();
      form.set("name", "New Seller Name");
      await updateProfileAction(undefined, form);

      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/seller/settings");
    });

    it("revalidates /admin/settings after an admin updates their profile", async () => {
      const admin = await createUser("admin@test.com", ["ADMIN"]);
      vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN"] } } as never);

      const form = new FormData();
      form.set("name", "New Admin Name");
      await updateProfileAction(undefined, form);

      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/admin/settings");
    });

    it("saves the updated name for a seller", async () => {
      const seller = await createUser("seller2@test.com", ["SELLER"]);
      vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

      const form = new FormData();
      form.set("name", "Updated Seller");
      await updateProfileAction(undefined, form);

      const dbUser = await prisma.user.findUnique({ where: { id: seller.id } });
      expect(dbUser!.name).toBe("Updated Seller");
    });

    it("saves the updated name for an admin", async () => {
      const admin = await createUser("admin2@test.com", ["ADMIN"]);
      vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN"] } } as never);

      const form = new FormData();
      form.set("name", "Updated Admin");
      await updateProfileAction(undefined, form);

      const dbUser = await prisma.user.findUnique({ where: { id: admin.id } });
      expect(dbUser!.name).toBe("Updated Admin");
    });
  });

  // ─── updateSellerNotificationPrefsAction ─────────────────────────────────────

  describe("updateSellerNotificationPrefsAction", () => {
    let sellerId: string;

    beforeEach(async () => {
      const seller = await createUser("seller-notif@test.com", ["SELLER"]);
      sellerId = seller.id;
      vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
    });

    it("saves bidReceivedEmails=true", async () => {
      const form = new FormData();
      form.set("bidReceivedEmails", "true");
      form.set("saleCompletedEmails", "false");
      const result = await updateSellerNotificationPrefsAction(form);
      expect(result).toEqual({ success: true });

      const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
      const prefs = (dbUser!.loginMetadata as { notifications?: { bidReceivedEmails?: boolean } } | null)?.notifications;
      expect(prefs?.bidReceivedEmails).toBe(true);
    });

    it("saves bidReceivedEmails=false", async () => {
      const form = new FormData();
      form.set("bidReceivedEmails", "false");
      form.set("saleCompletedEmails", "true");
      const result = await updateSellerNotificationPrefsAction(form);
      expect(result).toEqual({ success: true });

      const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
      const prefs = (dbUser!.loginMetadata as { notifications?: { bidReceivedEmails?: boolean } } | null)?.notifications;
      expect(prefs?.bidReceivedEmails).toBe(false);
    });

    it("saves saleCompletedEmails=true", async () => {
      const form = new FormData();
      form.set("bidReceivedEmails", "false");
      form.set("saleCompletedEmails", "true");
      await updateSellerNotificationPrefsAction(form);

      const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
      const prefs = (dbUser!.loginMetadata as { notifications?: { saleCompletedEmails?: boolean } } | null)?.notifications;
      expect(prefs?.saleCompletedEmails).toBe(true);
    });

    it("saves saleCompletedEmails=false", async () => {
      const form = new FormData();
      form.set("bidReceivedEmails", "true");
      form.set("saleCompletedEmails", "false");
      await updateSellerNotificationPrefsAction(form);

      const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
      const prefs = (dbUser!.loginMetadata as { notifications?: { saleCompletedEmails?: boolean } } | null)?.notifications;
      expect(prefs?.saleCompletedEmails).toBe(false);
    });

    it("revalidates /seller/settings on success", async () => {
      const form = new FormData();
      form.set("bidReceivedEmails", "true");
      form.set("saleCompletedEmails", "true");
      await updateSellerNotificationPrefsAction(form);

      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/seller/settings");
    });

    it("preserves existing loginMetadata keys when updating notifications", async () => {
      await prisma.user.update({
        where: { id: sellerId },
        data: { loginMetadata: { someOtherKey: "preserved" } },
      });

      const form = new FormData();
      form.set("bidReceivedEmails", "true");
      form.set("saleCompletedEmails", "false");
      await updateSellerNotificationPrefsAction(form);

      const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
      const meta = dbUser!.loginMetadata as Record<string, unknown>;
      expect(meta.someOtherKey).toBe("preserved");
    });

    it("returns error for unauthenticated user", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      const form = new FormData();
      await expect(updateSellerNotificationPrefsAction(form)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    });

    it("returns error when called by a non-SELLER user", async () => {
      const buyer = await createUser("buyer-bad@test.com", ["BUYER"]);
      vi.mocked(auth).mockResolvedValue({ user: { id: buyer.id, roles: ["BUYER"] } } as never);
      const form = new FormData();
      const result = await updateSellerNotificationPrefsAction(form);
      expect(result).toHaveProperty("error");
    });
  });
});
