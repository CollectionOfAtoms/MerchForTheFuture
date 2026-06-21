import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

const { getDefaultShippingAddress } = await import("@/lib/account/address");

async function seedBuyer() {
  return prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] } });
}

describe("getDefaultShippingAddress — buying-cycle address pre-fill", () => {
  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  it("returns the buyer's primary saved address mapped to the checkout shape", async () => {
    const buyer = await seedBuyer();
    await prisma.userAddress.create({
      data: { userId: buyer.id, name: "Pat Buyer", line1: "1 Main St", line2: "Apt 2", city: "Portland", state: "OR", postal: "97201", country: "US", isDefault: true },
    });

    expect(await getDefaultShippingAddress(buyer.id)).toEqual({
      name: "Pat Buyer", line1: "1 Main St", line2: "Apt 2", city: "Portland", state: "OR", postal: "97201", country: "US",
    });
  });

  it("returns null when the buyer has no default address", async () => {
    const buyer = await seedBuyer();
    expect(await getDefaultShippingAddress(buyer.id)).toBeNull();
  });

  it("ignores non-default addresses", async () => {
    const buyer = await seedBuyer();
    await prisma.userAddress.create({
      data: { userId: buyer.id, name: "Other", line1: "9 Side St", city: "Seattle", postal: "98101", country: "US", isDefault: false },
    });
    expect(await getDefaultShippingAddress(buyer.id)).toBeNull();
  });

  it("maps optional line2/state absence to empty strings", async () => {
    const buyer = await seedBuyer();
    await prisma.userAddress.create({
      data: { userId: buyer.id, name: "Min", line1: "5 Plain Rd", city: "Austin", postal: "73301", country: "US", isDefault: true },
    });
    const a = await getDefaultShippingAddress(buyer.id);
    expect(a!.line2).toBe("");
    expect(a!.state).toBe("");
  });
});
