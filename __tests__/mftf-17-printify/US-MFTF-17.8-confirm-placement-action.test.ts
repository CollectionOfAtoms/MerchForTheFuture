import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// US-MFTF-17.8 — confirmPrintifyPlacementAction persists ONE placement row per
// listing (unique on apparelListingId, upserted in place), validating that the
// caller owns the listing and the four values are finite + within their clamped
// ranges. resetPrintifyPlacementAction deletes the row (back to centred default).

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn().mockResolvedValue(undefined) }));

const { confirmPrintifyPlacementAction, resetPrintifyPlacementAction } = await import(
  "@/app/actions/apparel"
);
const { auth } = await import("@/auth");

async function seedPrintifyListing() {
  const seller = await prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
  const pt = await prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRINTIFY",
      printifyBlueprintId: 5,
      printifyPrintProviderId: 41,
      printifyPrintAreas: { front: { width: 2400, height: 2800 } },
    },
  });
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      productTypeId: pt.id,
      title: "Solar Bloom Tee",
      retailPrice: 30,
      status: "ACTIVE",
      designImageUrl: "https://blob/design.png",
    },
  });
  return { seller, listing };
}

function authAs(id: string, roles: string[] = ["SELLER"]) {
  vi.mocked(auth).mockResolvedValue({ user: { id, roles } } as never);
}

const validPlacement = { x: 0.6, y: 0.4, scale: 1.2, angle: 15 };

describe("US-MFTF-17.8 — confirm/reset placement action", () => {
  beforeEach(async () => resetDatabase());
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  it("upserts one placement row for the owning seller", async () => {
    const { seller, listing } = await seedPrintifyListing();
    authAs(seller.id);

    const result = await confirmPrintifyPlacementAction(listing.id, validPlacement);
    expect(result).toMatchObject({ success: true });

    const rows = await prisma.apparelListingPrintifyPlacement.findMany({
      where: { apparelListingId: listing.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ x: 0.6, y: 0.4, scale: 1.2, angle: 15 });
  });

  it("updates the existing row in place on a second save (no duplication)", async () => {
    const { seller, listing } = await seedPrintifyListing();
    authAs(seller.id);

    await confirmPrintifyPlacementAction(listing.id, validPlacement);
    await confirmPrintifyPlacementAction(listing.id, { x: 0.3, y: 0.3, scale: 2, angle: -45 });

    const rows = await prisma.apparelListingPrintifyPlacement.findMany({
      where: { apparelListingId: listing.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ x: 0.3, y: 0.3, scale: 2, angle: -45 });
  });

  it("rejects out-of-range values without writing a row", async () => {
    const { seller, listing } = await seedPrintifyListing();
    authAs(seller.id);

    for (const bad of [
      { x: 1.5, y: 0.5, scale: 1, angle: 0 }, // x > 1
      { x: 0.5, y: 0.5, scale: 99, angle: 0 }, // scale > MAX
      { x: 0.5, y: 0.5, scale: 0.01, angle: 0 }, // scale < MIN
      { x: 0.5, y: 0.5, scale: 1, angle: 999 }, // angle out of range
      { x: NaN, y: 0.5, scale: 1, angle: 0 }, // non-finite
    ]) {
      const result = await confirmPrintifyPlacementAction(listing.id, bad);
      expect(result).toHaveProperty("error");
    }
    const rows = await prisma.apparelListingPrintifyPlacement.findMany({
      where: { apparelListingId: listing.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("rejects a non-owner and writes nothing", async () => {
    const { listing } = await seedPrintifyListing();
    const stranger = await prisma.user.create({
      data: { email: `x-${crypto.randomUUID()}@test.com`, name: "Nope", roles: ["SELLER"] as never },
    });
    authAs(stranger.id);

    const result = await confirmPrintifyPlacementAction(listing.id, validPlacement);
    expect(result).toHaveProperty("error");
    const rows = await prisma.apparelListingPrintifyPlacement.findMany({
      where: { apparelListingId: listing.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("reset deletes the saved row (idempotent when none exists)", async () => {
    const { seller, listing } = await seedPrintifyListing();
    authAs(seller.id);

    await confirmPrintifyPlacementAction(listing.id, validPlacement);
    const reset = await resetPrintifyPlacementAction(listing.id);
    expect(reset).toMatchObject({ success: true });
    expect(
      await prisma.apparelListingPrintifyPlacement.count({ where: { apparelListingId: listing.id } }),
    ).toBe(0);

    // Idempotent: resetting again with no row still succeeds.
    expect(await resetPrintifyPlacementAction(listing.id)).toMatchObject({ success: true });
  });
});
