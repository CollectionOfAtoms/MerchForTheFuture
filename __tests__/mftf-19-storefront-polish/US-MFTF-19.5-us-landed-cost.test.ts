import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { setUsLandedCostAction } = await import("@/app/actions/us-landed-cost");
const { updateReferencedListingAction } = await import("@/app/actions/referenced-apparel");
const { getApparelListingDetail } = await import("@/lib/apparel/detail");
const { auth } = await import("@/auth");

const mockedAuth = vi.mocked(auth);
const asAdmin = (id = "admin-1") => mockedAuth.mockResolvedValue({ user: { id, roles: ["ADMIN"] } } as never);
const asSeller = (id: string) => mockedAuth.mockResolvedValue({ user: { id, roles: ["SELLER"] } } as never);

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

describe("US-MFTF-19.5 — US-landed cost is admin-set, seller view-only", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => vi.clearAllMocks());

  it("an admin round-trips the cost as integer cents (USD)", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asAdmin();

    const res = await setUsLandedCostAction(listing.id, "12.50");
    expect(res).toMatchObject({ success: true });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBe(1250);
  });

  it("an admin clears the cost with a blank value (null = not recorded)", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    await prisma.apparelListing.update({ where: { id: listing.id }, data: { usLandedCost: 999 } });
    asAdmin();

    await setUsLandedCostAction(listing.id, "");
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBeNull();
  });

  it("rejects a negative cost", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asAdmin();

    const res = await setUsLandedCostAction(listing.id, "-3");
    expect(res).toMatchObject({ error: expect.any(String) });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBeNull();
  });

  it("is admin-gated: a seller cannot set the cost", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asSeller(seller.id);

    const res = await setUsLandedCostAction(listing.id, "10");
    expect(res).toMatchObject({ error: expect.any(String) });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBeNull();
  });

  it("the seller's update action never writes the cost, even if a value is submitted", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asSeller(seller.id);

    // A crafted form with usLandedCost must be ignored by the seller path.
    const res = await updateReferencedListingAction(
      listing.id,
      undefined,
      makeForm({ title: "Powered By Plants", retailPrice: "32", usLandedCost: "99.99" }),
    );
    expect(res).toMatchObject({ success: true });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.usLandedCost).toBeNull();
  });

  it("never leaks the US-landed cost into the buyer projection or any pricing path", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    asAdmin();
    await setUsLandedCostAction(listing.id, "12.50");

    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.retailPrice).toBe(32);
    expect(JSON.stringify(detail)).not.toContain("1250");
    expect(JSON.stringify(detail)).not.toMatch(/usLandedCost/i);
  });
});
