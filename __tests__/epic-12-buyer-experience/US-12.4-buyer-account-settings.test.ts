import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const {
  updateProfileAction,
  addAddressAction,
  setDefaultAddressAction,
  deleteAddressAction,
  updateNotificationPrefsAction,
} = await import("@/app/actions/account");
const { auth } = await import("@/auth");

describe("US-12.4 — Buyer Account Settings", () => {
  let buyerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const buyer = await prisma.user.create({
      data: { email: "buyer124@test.com", name: "Old Name", passwordHash: "hash", roles: ["BUYER"] },
    });
    buyerId = buyer.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  // ── Profile ─────────────────────────────────────────────────────────────────

  it("updateProfileAction saves new name", async () => {
    const form = new FormData();
    form.set("name", "New Name");
    const result = await updateProfileAction(undefined, form);
    expect(result).toEqual({ success: true });
    const user = await prisma.user.findUnique({ where: { id: buyerId } });
    expect(user!.name).toBe("New Name");
  });

  it("updateProfileAction rejects empty name", async () => {
    const form = new FormData();
    form.set("name", "  ");
    const result = await updateProfileAction(undefined, form);
    expect(result).toHaveProperty("error");
  });

  // ── Shipping addresses ───────────────────────────────────────────────────────

  it("addAddressAction creates a UserAddress record", async () => {
    const form = new FormData();
    form.set("name", "Jane Doe");
    form.set("line1", "123 Main St");
    form.set("city", "Portland");
    form.set("postal", "97201");
    const result = await addAddressAction(form);
    expect(result).toEqual({ success: true });
    const addresses = await prisma.userAddress.findMany({ where: { userId: buyerId } });
    expect(addresses).toHaveLength(1);
    expect(addresses[0].name).toBe("Jane Doe");
  });

  it("first added address is set as default automatically", async () => {
    const form = new FormData();
    form.set("name", "Jane"); form.set("line1", "1 A St"); form.set("city", "Portland"); form.set("postal", "97201");
    await addAddressAction(form);
    const addresses = await prisma.userAddress.findMany({ where: { userId: buyerId } });
    expect(addresses[0].isDefault).toBe(true);
  });

  it("setDefaultAddressAction marks one address as default and clears others", async () => {
    const a1 = await prisma.userAddress.create({
      data: { userId: buyerId, name: "A", line1: "1 A St", city: "PDX", postal: "97201", isDefault: true },
    });
    const a2 = await prisma.userAddress.create({
      data: { userId: buyerId, name: "B", line1: "2 B St", city: "PDX", postal: "97202", isDefault: false },
    });

    await setDefaultAddressAction(a2.id);

    const addresses = await prisma.userAddress.findMany({ where: { userId: buyerId } });
    const defaults = addresses.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(a2.id);
  });

  it("deleteAddressAction removes the address", async () => {
    const addr = await prisma.userAddress.create({
      data: { userId: buyerId, name: "Jane", line1: "1 St", city: "PDX", postal: "97201" },
    });
    const result = await deleteAddressAction(addr.id);
    expect(result).toEqual({ success: true });
    expect(await prisma.userAddress.findUnique({ where: { id: addr.id } })).toBeNull();
  });

  it("deleteAddressAction rejects deletion of another user's address", async () => {
    const other = await prisma.user.create({
      data: { email: "other124@test.com", name: "Other", passwordHash: "hash", roles: ["BUYER"] },
    });
    const addr = await prisma.userAddress.create({
      data: { userId: other.id, name: "Other", line1: "99 Elm", city: "NYC", postal: "10001" },
    });
    const result = await deleteAddressAction(addr.id);
    expect(result).toHaveProperty("error");
    expect(await prisma.userAddress.findUnique({ where: { id: addr.id } })).not.toBeNull();
  });

  // ── Notification preferences ─────────────────────────────────────────────────

  it("updateNotificationPrefsAction saves outbid email opt-out", async () => {
    const form = new FormData();
    form.set("outbidEmails", "false");
    const result = await updateNotificationPrefsAction(form);
    expect(result).toEqual({ success: true });
    const user = await prisma.user.findUnique({ where: { id: buyerId } });
    const prefs = (user!.loginMetadata as { notifications?: { outbidEmails?: boolean } } | null)?.notifications;
    expect(prefs?.outbidEmails).toBe(false);
  });

  it("updateNotificationPrefsAction saves outbid email opt-in", async () => {
    const form = new FormData();
    form.set("outbidEmails", "true");
    await updateNotificationPrefsAction(form);
    const user = await prisma.user.findUnique({ where: { id: buyerId } });
    const prefs = (user!.loginMetadata as { notifications?: { outbidEmails?: boolean } } | null)?.notifications;
    expect(prefs?.outbidEmails).toBe(true);
  });

  // ── Auth guard ───────────────────────────────────────────────────────────────

  it("unauthenticated user is redirected", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const form = new FormData();
    form.set("name", "X");
    await expect(updateProfileAction(undefined, form)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });
});
