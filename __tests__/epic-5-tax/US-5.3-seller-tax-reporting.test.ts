import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/auth");
const { getTaxRegistrations } = await import("@/lib/tax/nexus");
const { getPendingTaxCertificateQueue, countPendingTaxCertificates } = await import("@/lib/tax/approvals");
const AdminTaxPage = (await import("@/app/(main)/admin/tax/page")).default;

function authAs(roles: string[]) {
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles } } as never);
}

async function seedBuyer() {
  return prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@test.com`, name: "Buyer", roles: ["BUYER"] } });
}

describe("US-5.3 — Tax Reporting via Stripe Dashboard + Nexus", () => {
  beforeEach(async () => { await resetDatabase(); vi.clearAllMocks(); });
  afterEach(async () => resetDatabase());

  describe("nexus monitoring (Stripe tax registrations)", () => {
    it("lists the platform's active tax registrations", async () => {
      const rows = await getTaxRegistrations();
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const or = rows.find((r) => r.state === "OR");
      expect(or).toBeDefined();
      expect(or!.country).toBe("US");
      expect(or!.status).toBe("active");
    });
  });

  describe("pending certificate approval queue", () => {
    it("returns only PENDING certificates with buyer info", async () => {
      const a = await seedBuyer();
      const b = await seedBuyer();
      await prisma.taxExemptionCertificate.create({ data: { userId: a.id, fileUrl: "u1", exemptionType: "exempt", status: "PENDING" } });
      await prisma.taxExemptionCertificate.create({ data: { userId: b.id, fileUrl: "u2", exemptionType: "exempt", status: "APPROVED" } });

      const queue = await getPendingTaxCertificateQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].userId).toBe(a.id);
      expect(queue[0].buyerEmail).toBe(a.email);
      expect(await countPendingTaxCertificates()).toBe(1);
    });
  });

  describe("admin Tax page", () => {
    it("redirects a non-admin", async () => {
      authAs(["BUYER"]);
      await expect(AdminTaxPage()).rejects.toThrow(/NEXT_REDIRECT/);
    });

    it("renders the Stripe Tax reports link + nexus panel for an admin", async () => {
      authAs(["ADMIN"]);
      const html = renderToStaticMarkup(await AdminTaxPage());
      expect(html).toContain("dashboard.stripe.com/tax/reports");
      // Nexus panel shows the registered jurisdiction from Stripe.
      expect(html).toContain("OR");
    });
  });
});
