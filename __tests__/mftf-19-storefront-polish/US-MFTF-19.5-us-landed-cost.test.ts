import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { updateReferencedListingAction } = await import("@/app/actions/referenced-apparel");
const { getApparelListingDetail } = await import("@/lib/apparel/detail");
const { auth } = await import("@/auth");

const mockedAuth = vi.mocked(auth);

async function seedSeller() {
  return prisma.user.create({
    data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: ["SELLER"] as never },
  });
}

async function seedReferencedListing(sellerId: string) {
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title: "Powered By Plants",
      description: "Tee",
      retailPrice: 32,
      status: "ACTIVE",
      providerKey: "teemill",
      providerProductRef: `ref-${crypto.randomUUID()}`,
      providerBaseCurrency: "GBP",
      providerBasePrice: 19,
      referencedVariants: {
        create: [
          { variantRef: `https://api.teemill.com/v1/catalog/variants/${crypto.randomUUID()}`, colorName: "Stone", colorHex: "#d6d3d1", sizeLabel: "M", stockLevel: 5, isOrderable: true, mockupUrl: "https://images.podos.io/m.jpg" },
        ],
      },
    },
  });
}

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function asSeller(id: string) {
  mockedAuth.mockResolvedValue({ user: { id, roles: ["SELLER"] } } as never);
}

describe("US-MFTF-19.5 — founder records US-landed cost", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => vi.clearAllMocks());

  it("round-trips a US-landed cost as integer cents (USD)", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asSeller(seller.id);

    const res = await updateReferencedListingAction(
      listing.id,
      undefined,
      makeForm({ title: "Powered By Plants", retailPrice: "32", usLandedCost: "12.50" }),
    );
    expect(res).toMatchObject({ success: true });

    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBe(1250);
  });

  it("clears the cost when the field is left blank (null = not recorded)", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    await prisma.apparelListing.update({ where: { id: listing.id }, data: { usLandedCost: 999 } });
    asSeller(seller.id);

    await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "Powered By Plants", retailPrice: "32", usLandedCost: "" }));
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBeNull();
  });

  it("rejects a negative cost", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asSeller(seller.id);

    const res = await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "Powered By Plants", retailPrice: "32", usLandedCost: "-3" }));
    expect(res).toMatchObject({ error: expect.any(String) });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBeNull();
  });

  it("is auth-gated: a non-seller cannot write the cost", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    mockedAuth.mockResolvedValue({ user: { id: "someone-else", roles: ["BUYER"] } } as never);

    const res = await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "X", retailPrice: "32", usLandedCost: "10" }));
    expect(res).toMatchObject({ error: expect.any(String) });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBeNull();
  });

  it("never leaks the US-landed cost into the buyer projection or any pricing path", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asSeller(seller.id);
    await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "Powered By Plants", retailPrice: "32", usLandedCost: "12.50" }));

    const detail = await getApparelListingDetail(listing.id);
    // The buyer still pays the fixed USD retail price; the cost is invisible.
    expect(detail!.retailPrice).toBe(32);
    expect(JSON.stringify(detail)).not.toContain("1250");
    expect(JSON.stringify(detail)).not.toMatch(/usLandedCost/i);
  });
});
