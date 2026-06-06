import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Mocks (must precede dynamic imports) ─────────────────────────────────────

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

let capturedConfig: { allowedContentTypes?: string[]; maximumSizeInBytes?: number } = {};

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: () => Promise<unknown> }) => {
    capturedConfig = (await onBeforeGenerateToken()) as typeof capturedConfig;
    return {};
  }),
}));

const { auth } = await import("@/auth");
const { POST } = await import("@/app/api/blob/upload/route");
const { validateUpload, UPLOAD_MAX_BYTES, ACCEPTED_UPLOAD_TYPES } = await import(
  "@/lib/artworks/upload-validation"
);

const MAX_SIZE = 70 * 1024 * 1024; // 70 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSellerSession() {
  return { user: { id: "seller-1", roles: ["SELLER"] } };
}

function makeRequest(body: unknown = { type: "blob.generate-client-token" }) {
  return new Request("http://localhost/api/blob/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── US-18.1 — Accept High-Resolution Artwork Uploads ─────────────────────────

describe("US-18.1 — Accept High-Resolution Artwork Uploads", () => {
  beforeEach(() => {
    capturedConfig = {};
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── validateUpload utility ─────────────────────────────────────────────────

  describe("validateUpload() — client-side validation logic", () => {
    it("exports UPLOAD_MAX_BYTES equal to 70 MB", () => {
      expect(UPLOAD_MAX_BYTES).toBe(MAX_SIZE);
    });

    it("exports ACCEPTED_UPLOAD_TYPES including image/tiff", () => {
      expect(ACCEPTED_UPLOAD_TYPES).toContain("image/tiff");
    });

    it("accepts image/jpeg under 70 MB", () => {
      const result = validateUpload({ size: 1024, type: "image/jpeg" });
      expect(result.valid).toBe(true);
    });

    it("accepts image/png under 70 MB", () => {
      const result = validateUpload({ size: 1024, type: "image/png" });
      expect(result.valid).toBe(true);
    });

    it("accepts image/webp under 70 MB", () => {
      const result = validateUpload({ size: 1024, type: "image/webp" });
      expect(result.valid).toBe(true);
    });

    it("accepts image/tiff under 70 MB", () => {
      const result = validateUpload({ size: 1024, type: "image/tiff" });
      expect(result.valid).toBe(true);
    });

    it("rejects files exceeding 70 MB", () => {
      const result = validateUpload({ size: MAX_SIZE + 1, type: "image/jpeg" });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toMatch(/70\s*mb/i);
    });

    it("accepts files exactly at the 70 MB boundary", () => {
      const result = validateUpload({ size: MAX_SIZE, type: "image/jpeg" });
      expect(result.valid).toBe(true);
    });

    it("rejects image/gif with a clear error", () => {
      const result = validateUpload({ size: 1024, type: "image/gif" });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBeTruthy();
    });

    it("rejects image/bmp", () => {
      const result = validateUpload({ size: 1024, type: "image/bmp" });
      expect(result.valid).toBe(false);
    });

    it("rejects application/pdf", () => {
      const result = validateUpload({ size: 1024, type: "application/pdf" });
      expect(result.valid).toBe(false);
    });
  });

  // ── API route auth guard ───────────────────────────────────────────────────

  describe("/api/blob/upload route", () => {
    it("returns 401 for unauthenticated requests", async () => {
      vi.mocked(auth).mockResolvedValue(null);
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it("returns 401 for BUYER role (sellers only)", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "buyer-1", roles: ["BUYER"] },
      } as never);
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it("calls handleUpload for authenticated SELLER", async () => {
      vi.mocked(auth).mockResolvedValue(makeSellerSession() as never);
      await POST(makeRequest());
      const { handleUpload } = await import("@vercel/blob/client");
      expect(handleUpload).toHaveBeenCalledOnce();
    });

    // ── onBeforeGenerateToken configuration ──────────────────────────────────

    it("allows image/tiff in allowedContentTypes", async () => {
      vi.mocked(auth).mockResolvedValue(makeSellerSession() as never);
      await POST(makeRequest());
      expect(capturedConfig.allowedContentTypes).toContain("image/tiff");
    });

    it("allows image/jpeg in allowedContentTypes", async () => {
      vi.mocked(auth).mockResolvedValue(makeSellerSession() as never);
      await POST(makeRequest());
      expect(capturedConfig.allowedContentTypes).toContain("image/jpeg");
    });

    it("allows image/png in allowedContentTypes", async () => {
      vi.mocked(auth).mockResolvedValue(makeSellerSession() as never);
      await POST(makeRequest());
      expect(capturedConfig.allowedContentTypes).toContain("image/png");
    });

    it("allows image/webp in allowedContentTypes", async () => {
      vi.mocked(auth).mockResolvedValue(makeSellerSession() as never);
      await POST(makeRequest());
      expect(capturedConfig.allowedContentTypes).toContain("image/webp");
    });

    it("sets maximumSizeInBytes to 70 MB (73400320 bytes)", async () => {
      vi.mocked(auth).mockResolvedValue(makeSellerSession() as never);
      await POST(makeRequest());
      expect(capturedConfig.maximumSizeInBytes).toBe(MAX_SIZE);
    });
  });
});
