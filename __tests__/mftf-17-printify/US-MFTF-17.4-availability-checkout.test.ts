import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

// US-MFTF-17.4 — checkout re-checks live Printify availability (a cart item can go
// out of stock while it sits in the cart for days). revalidateCheckout drops a
// now-unavailable Printify item with a clear message and keeps available ones,
// reusing the same detail-projection availability as the product page. Fails OPEN.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

const { revalidateCheckout } = await import("@/lib/checkout/revalidate");

const VARIANTS_URL =
  "https://api.printify.com/v1/catalog/blueprints/:bp/print_providers/:pp/variants.json";

async function seedPrintifyListing() {
  const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] } });
  const pt = await prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRINTIFY",
      printifyBlueprintId: 5,
      printifyPrintProviderId: 41,
      colors: { create: [{ colorName: "Black", providerColorCode: "Black" }] },
      sizes: { create: [
        { sizeLabel: "S", providerSizeCode: "S", sortOrder: 0 },
        { sizeLabel: "M", providerSizeCode: "M", sortOrder: 1 },
      ] },
      printifyVariants: { create: [
        { colorName: "Black", sizeLabel: "S", printifyVariantId: 17401 },
        { colorName: "Black", sizeLabel: "M", printifyVariantId: 17402 },
      ] },
    },
    include: { colors: true },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId: seller.id, sourcingMode: "DESIGNED", productTypeId: pt.id,
      title: "Solar Bloom Tee", retailPrice: 30, status: "ACTIVE", designImageUrl: "https://b/d.png",
      colors: { create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: true })) },
    },
  });
}

async function seedCart(userId: string, listingId: string, selections: Array<{ colorId: string; sizeLabel: string }>) {
  const cart = await prisma.cart.create({ data: { userId } });
  for (const selection of selections) {
    await prisma.cartItem.create({ data: { cartId: cart.id, itemKind: "APPAREL", apparelListingId: listingId, selection, quantity: 1 } });
  }
  return cart;
}

describe("US-MFTF-17.4 — checkout re-checks Printify availability", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("removes a now-out-of-stock Printify item and keeps the in-stock one", async () => {
    const buyer = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@t.com`, roles: ["BUYER"] } });
    const listing = await seedPrintifyListing();
    // Black/M is out of stock (default list drops it); Black/S is in stock.
    const cart = await seedCart(buyer.id, listing.id, [
      { colorId: "Black", sizeLabel: "M" },
      { colorId: "Black", sizeLabel: "S" },
    ]);

    const result = await revalidateCheckout(cart.id);

    expect(result.removed.length).toBe(1);
    expect(result.removed[0].reason).toMatch(/no longer available|out of stock|unavailable/i);
    const remaining = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
    expect(remaining).toHaveLength(1);
    expect((remaining[0].selection as { sizeLabel?: string }).sizeLabel).toBe("S");
  });

  it("fails OPEN: if the availability read errors, the item is kept", async () => {
    server.use(http.get(VARIANTS_URL, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    const buyer = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@t.com`, roles: ["BUYER"] } });
    const listing = await seedPrintifyListing();
    const cart = await seedCart(buyer.id, listing.id, [{ colorId: "Black", sizeLabel: "M" }]);

    const result = await revalidateCheckout(cart.id);

    expect(result.removed.filter((r) => /available|stock/i.test(r.reason))).toHaveLength(0);
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(1);
  });
});
