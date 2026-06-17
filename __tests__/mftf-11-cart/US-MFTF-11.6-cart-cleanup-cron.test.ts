import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { cleanupStaleGuestCarts } from "@/lib/cart/cleanup";
import { GET } from "@/app/api/cron/cleanup-carts/route";

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeCart(opts: { guestToken?: string; userId?: string; ageDays: number }) {
  const cart = await prisma.cart.create({
    data: opts.userId ? { userId: opts.userId } : { guestToken: opts.guestToken },
  });
  // updatedAt is @updatedAt-managed, so backdate it with raw SQL.
  const when = new Date(Date.now() - opts.ageDays * DAY_MS);
  await prisma.$executeRaw`UPDATE "Cart" SET "updatedAt" = ${when} WHERE id = ${cart.id}`;
  return cart;
}

describe("US-MFTF-11.6 — cleanupStaleGuestCarts", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("deletes guest carts older than 30 days but keeps newer ones and all user carts", async () => {
    const buyer = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] as never } });

    const fresh = await makeCart({ guestToken: `g-29-${crypto.randomUUID()}`, ageDays: 29 });
    const stale = await makeCart({ guestToken: `g-31-${crypto.randomUUID()}`, ageDays: 31 });
    const staleUser = await makeCart({ userId: buyer.id, ageDays: 400 }); // old, but a user cart

    const result = await cleanupStaleGuestCarts();

    expect(result.deleted).toBe(1);
    expect(await prisma.cart.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.cart.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await prisma.cart.findUnique({ where: { id: staleUser.id } })).not.toBeNull();
  });

  it("cascades the deleted guest cart's items", async () => {
    const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@test.com`, roles: ["SELLER"] as never } });
    const pt = await prisma.productType.create({
      data: { name: `PT ${crypto.randomUUID()}`, fulfillmentProvider: "PRODIGI", providerSkuBase: "RNA1" },
    });
    const apparel = await prisma.apparelListing.create({
      data: { sellerId: seller.id, sourcingMode: "DESIGNED", productTypeId: pt.id, title: "Tee", retailPrice: 28, status: "ACTIVE", designImageUrl: "https://b/d.png" },
    });
    const cart = await prisma.cart.create({
      data: {
        guestToken: `g-old-${crypto.randomUUID()}`,
        items: { create: { itemKind: "APPAREL", apparelListingId: apparel.id, selection: { colorId: "White", sizeLabel: "M" } as never } },
      },
    });
    await prisma.$executeRaw`UPDATE "Cart" SET "updatedAt" = ${new Date(Date.now() - 31 * DAY_MS)} WHERE id = ${cart.id}`;

    await cleanupStaleGuestCarts();
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });
});

describe("US-MFTF-11.6 — GET /api/cron/cleanup-carts", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("returns 401 without the CRON_SECRET bearer token", async () => {
    const res = await GET(new Request("https://x/api/cron/cleanup-carts"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong token", async () => {
    const res = await GET(
      new Request("https://x/api/cron/cleanup-carts", { headers: { authorization: "Bearer nope" } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 and a deleted count with the correct bearer token", async () => {
    const stale = await makeCart({ guestToken: `g-31-${crypto.randomUUID()}`, ageDays: 31 });
    const res = await GET(
      new Request("https://x/api/cron/cleanup-carts", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(1);
    expect(await prisma.cart.findUnique({ where: { id: stale.id } })).toBeNull();
  });
});
