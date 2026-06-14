import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  buildPoweredByPlantsCatalog,
  POWERED_BY_PLANTS_PRODUCT_REF,
} from "../mocks/teemill-fixture";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createReferencedListingAction, resolveTeemillRefAction } = await import(
  "@/app/actions/referenced-apparel"
);
const { referencedListingImages, teemillDescriptionToText } = await import(
  "@/lib/apparel/referenced"
);
const { getSellerListings } = await import("@/lib/seller/listings");
const { auth } = await import("@/auth");

const CATALOG_URL = "https://api.teemill.com/v1/catalog/products";

async function seedSeller(roles: string[] = ["SELLER"]) {
  return prisma.user.create({
    data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: roles as never },
  });
}

function makeForm(fields: {
  providerProductRef?: string;
  title?: string;
  description?: string;
  retailPrice?: string;
  intent?: string;
  lifestyleUrls?: string[];
}): FormData {
  const fd = new FormData();
  if (fields.providerProductRef !== undefined) fd.set("providerProductRef", fields.providerProductRef);
  if (fields.title !== undefined) fd.set("title", fields.title);
  if (fields.description !== undefined) fd.set("description", fields.description);
  if (fields.retailPrice !== undefined) fd.set("retailPrice", fields.retailPrice);
  if (fields.intent !== undefined) fd.set("intent", fields.intent);
  for (const url of fields.lifestyleUrls ?? []) fd.append("lifestyleImageUrl", url);
  return fd;
}

function validForm(overrides: Partial<Parameters<typeof makeForm>[0]> = {}) {
  return makeForm({
    providerProductRef: POWERED_BY_PLANTS_PRODUCT_REF,
    title: "Powered By Plants",
    description: "Organic cotton tee",
    retailPrice: "32",
    intent: "publish",
    lifestyleUrls: [],
    ...overrides,
  });
}

async function submit(fd: FormData): Promise<{ result?: unknown; redirect?: string }> {
  try {
    return { result: await createReferencedListingAction(undefined, fd) };
  } catch (e) {
    return { redirect: (e as Error).message };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("US-MFTF-13.3 — createReferencedListingAction auth", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized with no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { result } = await submit(validForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Unauthorized for a non-seller", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "b", roles: ["BUYER"] } } as never);
    const { result } = await submit(validForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("resolveTeemillRefAction is Unauthorized for a non-seller", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "b", roles: ["BUYER"] } } as never);
    const res = await resolveTeemillRefAction(POWERED_BY_PLANTS_PRODUCT_REF);
    expect(res).toEqual({ error: "Unauthorized" });
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("US-MFTF-13.3 — createReferencedListingAction validation", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;
  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("rejects an unresolvable ref and re-surfaces the on-Teemill guidance", async () => {
    const { result } = await submit(validForm({ providerProductRef: "totally-bogus-ref" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/Teemill/i) });
    // No listing was created.
    expect(await prisma.apparelListing.count()).toBe(0);
  });

  it("rejects a retail price below $1", async () => {
    const { result } = await submit(validForm({ retailPrice: "0.50" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/price/i) });
  });

  it("rejects publishing when no variant is orderable", async () => {
    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json(buildPoweredByPlantsCatalog({ forceStock: 0 }))),
    );
    const { result } = await submit(validForm());
    expect(result).toMatchObject({ error: expect.stringMatching(/stock|orderable/i) });
    expect(await prisma.apparelListing.count()).toBe(0);
  });

  it("rejects a missing title", async () => {
    const { result } = await submit(validForm({ title: "" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/title/i) });
  });
});

// ─── Success ──────────────────────────────────────────────────────────────────

describe("US-MFTF-13.3 — createReferencedListingAction success", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;
  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("creates a REFERENCED listing with provider fields + ReferencedVariant rows, then redirects to edit", async () => {
    const { redirect } = await submit(validForm({ intent: "publish" }));
    const listing = await prisma.apparelListing.findFirst({
      where: { sellerId: seller.id },
      include: { referencedVariants: true, colors: true },
    });
    expect(listing).not.toBeNull();
    expect(listing!.sourcingMode).toBe("REFERENCED");
    expect(listing!.status).toBe("ACTIVE");
    expect(listing!.productTypeId).toBeNull();
    expect(listing!.designImageUrl).toBeNull();
    expect(listing!.providerKey).toBe("teemill");
    expect(listing!.providerProductRef).toBe(POWERED_BY_PLANTS_PRODUCT_REF);
    expect(listing!.providerBaseCurrency).toBe("GBP");
    expect(Number(listing!.providerBasePrice)).toBe(21);
    expect(Number(listing!.retailPrice)).toBe(32);
    expect(listing!.colors).toHaveLength(0);
    expect(listing!.referencedVariants.length).toBeGreaterThan(0);
    expect(redirect).toContain(`/seller/apparel/${listing!.id}/edit`);
  });

  it("saves as a draft (ARCHIVED) when intent is draft", async () => {
    await submit(validForm({ intent: "draft" }));
    const listing = await prisma.apparelListing.findFirst({ where: { sellerId: seller.id } });
    expect(listing!.status).toBe("ARCHIVED");
  });

  it("uploads no design file and creates no ApparelListingColor rows", async () => {
    await submit(validForm());
    const listing = await prisma.apparelListing.findFirst({
      where: { sellerId: seller.id },
      include: { colors: true },
    });
    expect(listing!.designImageUrl).toBeNull();
    expect(listing!.colors).toHaveLength(0);
  });

  it("falls back to cached Teemill mockups as images when no lifestyle photos are uploaded", async () => {
    await submit(validForm({ lifestyleUrls: [] }));
    const listing = await prisma.apparelListing.findFirst({
      where: { sellerId: seller.id },
      include: { images: true, referencedVariants: true },
    });
    expect(listing!.images).toHaveLength(0);
    const sources = referencedListingImages({
      lifestyle: listing!.images,
      variants: listing!.referencedVariants,
    });
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((u) => u.includes("podos.io"))).toBe(true);
  });

  it("uses uploaded lifestyle photos as images when provided", async () => {
    await submit(
      validForm({
        lifestyleUrls: [
          "https://blob.vercel.com/apparel/ls/a.jpg",
          "https://blob.vercel.com/apparel/ls/b.jpg",
        ],
      }),
    );
    const listing = await prisma.apparelListing.findFirst({
      where: { sellerId: seller.id },
      include: { images: { orderBy: { sortOrder: "asc" } }, referencedVariants: true },
    });
    expect(listing!.images).toHaveLength(2);
    expect(listing!.images[0].isPrimary).toBe(true);
    const sources = referencedListingImages({
      lifestyle: listing!.images,
      variants: listing!.referencedVariants,
    });
    expect(sources[0]).toBe("https://blob.vercel.com/apparel/ls/a.jpg");
  });
});

// ─── teemillDescriptionToText (HTML → plain text for the description default) ──

describe("US-MFTF-13.3 — teemillDescriptionToText", () => {
  it("strips a single paragraph to plain text", () => {
    expect(teemillDescriptionToText("<p>Organic cotton tee.</p>")).toBe("Organic cotton tee.");
  });

  it("turns block tags and <br> into line breaks", () => {
    expect(teemillDescriptionToText("<p>Line one.</p><p>Line two.</p>")).toBe(
      "Line one.\nLine two.",
    );
    expect(teemillDescriptionToText("Line one.<br>Line two.")).toBe("Line one.\nLine two.");
  });

  it("decodes common HTML entities and collapses whitespace", () => {
    expect(teemillDescriptionToText("<p>Bees &amp;   plants&nbsp;&#39;26</p>")).toBe(
      "Bees & plants '26",
    );
  });

  it("returns an empty string for null/empty input", () => {
    expect(teemillDescriptionToText(null)).toBe("");
    expect(teemillDescriptionToText("")).toBe("");
  });

  it("drops <script>/<style> contents and HTML comments entirely", () => {
    expect(
      teemillDescriptionToText(
        '<p>Hello</p><script>alert("x")</script><style>.a{}</style><!-- note --><p>World</p>',
      ),
    ).toBe("Hello\nWorld");
  });

  it("decodes numeric and hex entities", () => {
    expect(teemillDescriptionToText("<p>caf&#233; &#x26; co</p>")).toBe("café & co");
  });

  it("strips malformed/unclosed tags without leaking markup", () => {
    expect(teemillDescriptionToText("<p>Tee <b>bold</p>")).toBe("Tee bold");
    // A stray angle-bracket span is treated as a tag and removed (Teemill encodes
    // real `<` as &lt;); the point is no markup leaks through.
    expect(teemillDescriptionToText("a < b and c > d")).toBe("a d");
  });
});

// ─── Seller index renders REFERENCED rows (MFTF-13 schema-touch of 6.3 slice) ──

describe("US-MFTF-13.3 — getSellerListings renders referenced listings", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;
  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns a referenced row (no productType) without crashing, using a mockup thumbnail and provider label", async () => {
    await submit(validForm());
    const rows = await getSellerListings(seller.id);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.kind).toBe("APPAREL");
    if (row.kind !== "APPAREL") return;
    expect(row.sourcingMode).toBe("REFERENCED");
    expect(row.productTypeName).toBe("Teemill");
    expect(row.thumbnailUrl).toContain("podos.io");
    expect(row.retailPrice).toBe(32);
  });
});

// ─── resolveTeemillRefAction (Step 1 preview) ─────────────────────────────────

describe("US-MFTF-13.3 — resolveTeemillRefAction preview", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;
  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns a preview with colour swatches (hex), sizes, mockups and GBP base price", async () => {
    const res = await resolveTeemillRefAction(POWERED_BY_PLANTS_PRODUCT_REF);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.preview.title).toBe("Powered By Plants");
    expect(res.preview.providerBaseCurrency).toBe("GBP");
    expect(res.preview.providerBasePrice).toBe(21);
    expect(res.preview.colors.find((c) => c.colorName === "Evergreen")?.colorHex).toBe("#23312d");
    expect(res.preview.sizes.length).toBeGreaterThan(0);
    expect(res.preview.mockups.length).toBeGreaterThan(0);
  });

  it("returns the Teemill description as cleaned plain text for the form default", async () => {
    const res = await resolveTeemillRefAction(POWERED_BY_PLANTS_PRODUCT_REF);
    if ("error" in res) throw new Error("expected preview");
    expect(res.preview.description).toBe("Organic cotton tee.");
  });

  it("returns an error with guidance when the ref cannot be resolved", async () => {
    const res = await resolveTeemillRefAction("nope");
    expect("error" in res).toBe(true);
    if (!("error" in res)) return;
    expect(res.error).toMatch(/Teemill|find|ref/i);
  });
});
