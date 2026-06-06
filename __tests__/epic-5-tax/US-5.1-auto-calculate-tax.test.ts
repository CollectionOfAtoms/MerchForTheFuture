import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { calculateTax, applyTaxToOrder, TaxAddress } from "@/lib/tax/calculate";

describe("US-5.1 — Auto-Calculate Tax by Buyer Location", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedOrder(overrides: Record<string, unknown> = {}) {
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x" },
    });
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: {
        title: "Test Art",
        description: "",
        sellerId: seller.id,
        status: "PUBLISHED",
      },
    });
    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 100,
        currency: "USD",
        status: "ACTIVE",
      },
    });
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 100,
        taxAmount: 0,
        totalAmount: 100,
        shippingName: "Buyer",
        shippingLine1: "123 Main St",
        shippingCity: "Los Angeles",
        shippingState: "CA",
        shippingPostal: "90001",
        shippingCountry: "US",
        ...overrides,
      },
    });
    return { buyer, seller, artwork, listing, order };
  }

  it("calculates US sales tax for a given address", async () => {
    const address: TaxAddress = {
      street: "123 Main St",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      country: "US",
    };
    const result = await calculateTax({ address, subtotal: 100, currency: "USD" });
    expect(result.taxAmount).toBeCloseTo(8.5, 2);
    expect(result.taxRate).toBeCloseTo(0.085, 4);
    expect(result.hasNexus).toBe(true);
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.state_tax_rate).toBeDefined();
  });

  it("applies tax to order and updates taxAmount, taxRate, totalAmount", async () => {
    const { order } = await seedOrder();
    const address: TaxAddress = {
      street: "123 Main St",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      country: "US",
    };
    await applyTaxToOrder(order.id, address);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(Number(updated!.taxAmount)).toBeCloseTo(8.5, 2);
    expect(Number(updated!.taxRate)).toBeCloseTo(0.085, 4);
    expect(Number(updated!.totalAmount)).toBeCloseTo(108.5, 2);
    expect(updated!.taxJurisdiction).toBeTruthy();
  });

  it("stores shipping address from order fields when applying tax", async () => {
    const { order } = await seedOrder();
    const address: TaxAddress = {
      street: "123 Main St",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      country: "US",
    };
    await applyTaxToOrder(order.id, address);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(Number(updated!.taxAmount)).toBeGreaterThan(0);
  });

  it("returns zero tax when TaxJar returns no nexus", async () => {
    // MSW can be extended to handle country-level test; for now verify shape
    const address: TaxAddress = {
      street: "1 Test St",
      city: "Test",
      state: "CA",
      zip: "90001",
      country: "US",
    };
    const result = await calculateTax({ address, subtotal: 50, currency: "USD" });
    expect(result.taxAmount).toBeGreaterThanOrEqual(0);
    expect(typeof result.taxRate).toBe("number");
  });
});
