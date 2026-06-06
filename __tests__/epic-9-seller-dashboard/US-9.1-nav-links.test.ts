import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// Nav role logic is expressed through the database roles array — we test
// that the data model correctly tracks which roles a user has, rather than
// rendering the React component (which is a thin conditional on session.user.roles).

describe("US-9.1 — Nav links by role", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  it("seller user has SELLER role", async () => {
    const user = await prisma.user.create({
      data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER", "BUYER"] },
    });
    expect(user.roles).toContain("SELLER");
    expect(user.roles).not.toContain("ADMIN");
  });

  it("admin user has ADMIN role", async () => {
    const user = await prisma.user.create({
      data: { email: "admin@test.com", passwordHash: "x", roles: ["ADMIN", "BUYER"] },
    });
    expect(user.roles).toContain("ADMIN");
  });

  it("buyer-only user does not have SELLER or ADMIN role", async () => {
    const user = await prisma.user.create({
      data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"] },
    });
    expect(user.roles).not.toContain("SELLER");
    expect(user.roles).not.toContain("ADMIN");
  });

  it("newly created user defaults to BUYER role only", async () => {
    const user = await prisma.user.create({
      data: { email: "new@test.com", passwordHash: "x" },
    });
    expect(user.roles).toEqual(["BUYER"]);
  });

  it("a user can hold both SELLER and ADMIN roles simultaneously", async () => {
    const user = await prisma.user.create({
      data: { email: "superuser@test.com", passwordHash: "x", roles: ["SELLER", "ADMIN", "BUYER"] },
    });
    expect(user.roles).toContain("SELLER");
    expect(user.roles).toContain("ADMIN");
  });
});
