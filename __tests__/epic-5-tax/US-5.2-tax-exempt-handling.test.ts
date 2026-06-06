import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import {
  setTaxExemption,
  isTaxExempt,
  getTaxExemption,
} from "@/lib/tax/exemption";
import { calculateTax, TaxAddress } from "@/lib/tax/calculate";

describe("US-5.2 — Tax-Exempt Handling", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedBuyer() {
    return prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x" },
    });
  }

  it("buyer is not tax-exempt by default", async () => {
    const buyer = await seedBuyer();
    const exempt = await isTaxExempt(buyer.id);
    expect(exempt).toBe(false);
  });

  it("can set tax exemption with certificate info", async () => {
    const buyer = await seedBuyer();
    await setTaxExemption(buyer.id, {
      certificateId: "cert-123",
      exemptionType: "wholesale",
      state: "CA",
      expiresAt: new Date("2027-01-01"),
    });
    const exempt = await isTaxExempt(buyer.id);
    expect(exempt).toBe(true);
  });

  it("returns exemption details when set", async () => {
    const buyer = await seedBuyer();
    await setTaxExemption(buyer.id, {
      certificateId: "cert-456",
      exemptionType: "resale",
      state: "NY",
      expiresAt: new Date("2027-06-01"),
    });
    const details = await getTaxExemption(buyer.id);
    expect(details).not.toBeNull();
    expect(details!.certificateId).toBe("cert-456");
    expect(details!.exemptionType).toBe("resale");
    expect(details!.state).toBe("NY");
  });

  it("expired exemption is treated as not exempt", async () => {
    const buyer = await seedBuyer();
    await setTaxExemption(buyer.id, {
      certificateId: "cert-expired",
      exemptionType: "wholesale",
      state: "CA",
      expiresAt: new Date("2020-01-01"), // past
    });
    const exempt = await isTaxExempt(buyer.id);
    expect(exempt).toBe(false);
  });

  it("calculateTax returns zero for exempt buyer", async () => {
    const buyer = await seedBuyer();
    await setTaxExemption(buyer.id, {
      certificateId: "cert-789",
      exemptionType: "wholesale",
      state: "CA",
      expiresAt: new Date("2027-01-01"),
    });
    const address: TaxAddress = {
      street: "123 Main St",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      country: "US",
    };
    const result = await calculateTax({ address, subtotal: 100, currency: "USD", buyerId: buyer.id });
    expect(result.taxAmount).toBe(0);
    expect(result.taxExempt).toBe(true);
  });

  it("can clear tax exemption", async () => {
    const buyer = await seedBuyer();
    await setTaxExemption(buyer.id, {
      certificateId: "cert-clear",
      exemptionType: "wholesale",
      state: "CA",
      expiresAt: new Date("2027-01-01"),
    });
    expect(await isTaxExempt(buyer.id)).toBe(true);
    await setTaxExemption(buyer.id, null);
    expect(await isTaxExempt(buyer.id)).toBe(false);
  });
});
