import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { updateReferencedListingAction } = await import("@/app/actions/referenced-apparel");
const { auth } = await import("@/auth");
const mockedAuth = vi.mocked(auth);

async function seedSeller() {
  return prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: ["SELLER"] as never } });
}
async function seedReferencedListing(sellerId: string) {
  return prisma.apparelListing.create({
    data: {
      sellerId, sourcingMode: "REFERENCED", title: "Tee", retailPrice: 32, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: `ref-${crypto.randomUUID()}`,
      referencedVariants: { create: [
        { variantRef: `https://api.teemill.com/v1/catalog/variants/${crypto.randomUUID()}`, colorName: "Stone", colorHex: "#d6d3d1", sizeLabel: "M", stockLevel: 5, isOrderable: true, mockupUrl: "https://images.podos.io/m.jpg" },
      ] },
    },
  });
}
function form(title: string): FormData {
  const fd = new FormData();
  fd.set("title", title);
  fd.set("retailPrice", "32");
  return fd;
}

describe("Admins can manage any seller's listing; non-owner sellers cannot", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => vi.clearAllMocks());

  it("an admin who is not the owner can edit the listing", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    mockedAuth.mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);

    const res = await updateReferencedListingAction(listing.id, undefined, form("Edited by admin"));
    expect(res).toMatchObject({ success: true });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.title).toBe("Edited by admin");
  });

  it("a different (non-owner, non-admin) seller still cannot edit it", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    mockedAuth.mockResolvedValue({ user: { id: "other-seller", roles: ["SELLER"] } } as never);

    const res = await updateReferencedListingAction(listing.id, undefined, form("Hacked"));
    expect(res).toMatchObject({ error: expect.any(String) });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.title).toBe("Tee");
  });
});
