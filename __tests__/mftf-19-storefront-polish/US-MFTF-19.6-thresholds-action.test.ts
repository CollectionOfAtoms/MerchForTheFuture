import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { updatePricingThresholdsAction } = await import("@/app/actions/pricing-config");
const { getPricingConfig, DEFAULT_THRESHOLDS } = await import("@/lib/pricing/config");
const { auth } = await import("@/auth");
const mockedAuth = vi.mocked(auth);

function makeForm(amber: string, red: string): FormData {
  const fd = new FormData();
  fd.set("amberAbove", amber);
  fd.set("redAbove", red);
  return fd;
}

describe("US-MFTF-19.6 — admin pricing thresholds", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => vi.clearAllMocks());

  it("returns defaults when no config row exists", async () => {
    const cfg = await getPricingConfig();
    expect(cfg).toEqual(DEFAULT_THRESHOLDS);
  });

  it("admin upserts the singleton thresholds (stored as cents)", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "a1", roles: ["ADMIN"] } } as never);
    const res = await updatePricingThresholdsAction(undefined, makeForm("15", "25"));
    expect(res).toMatchObject({ success: true });

    const cfg = await getPricingConfig();
    expect(cfg).toEqual({ amberAboveCents: 1500, redAboveCents: 2500 });

    // Upsert (single row), not insert-twice.
    mockedAuth.mockResolvedValue({ user: { id: "a1", roles: ["ADMIN"] } } as never);
    await updatePricingThresholdsAction(undefined, makeForm("20", "40"));
    const count = await prisma.pricingConfig.count();
    expect(count).toBe(1);
    expect(await getPricingConfig()).toEqual({ amberAboveCents: 2000, redAboveCents: 4000 });
  });

  it("rejects a non-admin", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1", roles: ["SELLER"] } } as never);
    const res = await updatePricingThresholdsAction(undefined, makeForm("15", "25"));
    expect(res).toMatchObject({ error: expect.any(String) });
    expect(await prisma.pricingConfig.count()).toBe(0);
  });

  it("rejects when amber threshold is not below the red threshold", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "a1", roles: ["ADMIN"] } } as never);
    const res = await updatePricingThresholdsAction(undefined, makeForm("30", "25"));
    expect(res).toMatchObject({ error: expect.any(String) });
    expect(await prisma.pricingConfig.count()).toBe(0);
  });
});
