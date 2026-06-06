import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { getTaxReport, exportTaxReportCSV, TaxReportFilters } from "@/lib/tax/reporting";

describe("US-5.3 — Seller Tax Reporting", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedSaleWithTax(
    sellerEmail: string,
    buyerEmail: string,
    taxAmount: number,
    taxJurisdiction: string,
    createdAt: Date
  ) {
    const seller = await prisma.user.findFirst({ where: { email: sellerEmail } }) ??
      await prisma.user.create({ data: { email: sellerEmail, name: "Seller", passwordHash: "x", roles: ["SELLER"] } });
    const buyer = await prisma.user.findFirst({ where: { email: buyerEmail } }) ??
      await prisma.user.create({ data: { email: buyerEmail, name: "Buyer", passwordHash: "x" } });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, currency: "USD", status: "SOLD" },
    });
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 100,
        taxAmount,
        taxRate: taxAmount / 100,
        taxJurisdiction,
        totalAmount: 100 + taxAmount,
        status: "PAID",
        createdAt,
      },
    });
    await prisma.transaction.create({
      data: {
        orderId: order.id,
        stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
        grossAmount: order.totalAmount,
        platformFee: 10.85,
        processingFee: 3.21,
        netPayout: 86.44,
      },
    });
    return { seller, buyer, artwork, listing, order };
  }

  it("returns tax collected grouped by jurisdiction", async () => {
    const now = new Date("2026-03-15");
    const { seller } = await seedSaleWithTax(
      "seller@test.com", "buyer1@test.com", 8.5, "CA", now
    );
    await seedSaleWithTax("seller@test.com", "buyer2@test.com", 4.0, "NY", now);

    const report = await getTaxReport(seller.id, {});
    expect(report.length).toBeGreaterThanOrEqual(2);
    const ca = report.find((r) => r.jurisdiction === "CA");
    expect(ca).toBeDefined();
    expect(Number(ca!.totalTaxCollected)).toBeCloseTo(8.5, 2);
    const ny = report.find((r) => r.jurisdiction === "NY");
    expect(ny).toBeDefined();
    expect(Number(ny!.totalTaxCollected)).toBeCloseTo(4.0, 2);
  });

  it("filters report by date range", async () => {
    const { seller } = await seedSaleWithTax(
      "seller@test.com", "buyer1@test.com", 8.5, "CA", new Date("2026-01-10")
    );
    await seedSaleWithTax("seller@test.com", "buyer2@test.com", 6.0, "CA", new Date("2026-03-20"));

    const filters: TaxReportFilters = {
      from: new Date("2026-02-01"),
      to: new Date("2026-04-01"),
    };
    const report = await getTaxReport(seller.id, filters);
    const ca = report.find((r) => r.jurisdiction === "CA");
    expect(ca).toBeDefined();
    expect(Number(ca!.totalTaxCollected)).toBeCloseTo(6.0, 2);
    expect(ca!.orderCount).toBe(1);
  });

  it("returns empty array when seller has no paid orders", async () => {
    const seller = await prisma.user.create({
      data: { email: "nosales@test.com", name: "No Sales", passwordHash: "x", roles: ["SELLER"] },
    });
    const report = await getTaxReport(seller.id, {});
    expect(report).toEqual([]);
  });

  it("exports CSV with required columns", async () => {
    const now = new Date("2026-03-15");
    const { seller } = await seedSaleWithTax(
      "seller@test.com", "buyer1@test.com", 8.5, "CA", now
    );
    const csv = await exportTaxReportCSV(seller.id, {});
    const lines = csv.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const header = lines[0];
    expect(header).toMatch(/jurisdiction/i);
    expect(header).toMatch(/tax/i);
    expect(header).toMatch(/order/i);
  });

  it("includes sale count and total taxable sales per jurisdiction", async () => {
    const now = new Date("2026-04-01");
    const { seller } = await seedSaleWithTax(
      "seller@test.com", "buyer1@test.com", 8.5, "CA", now
    );
    await seedSaleWithTax("seller@test.com", "buyer2@test.com", 8.5, "CA", now);

    const report = await getTaxReport(seller.id, {});
    const ca = report.find((r) => r.jurisdiction === "CA");
    expect(ca!.orderCount).toBe(2);
    expect(Number(ca!.totalTaxCollected)).toBeCloseTo(17.0, 2);
  });
});
