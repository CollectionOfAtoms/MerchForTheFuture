import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { removeWhiteBackground } from "@/lib/apparel/white-bg-removal";

const BLOB_TOKEN =
  process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

/** True for a raw Printify-hosted mockup image (images-api.printify.com / images.printify.com). */
export function isRawPrintifyMockup(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)printify\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Replace a referenced Printify listing's baked white-background mockups with transparent
 * PNGs stored in our blob, so the per-mockup background picker (US-MFTF-19.7) can
 * composite a backdrop behind them. Printify renders mockups on an opaque white studio
 * background (unlike Teemill's transparent PNGs), so without this the picker is a no-op.
 *
 * Idempotent: only rows whose `mockupUrl` is still a raw Printify image are processed
 * (an already-transparentized blob URL is skipped). Best-effort per distinct mockup — a
 * failure on one is logged and leaves that mockup untouched without blocking the others.
 * Run AFTER applyPrintifySnapshot (which resets mockupUrl to the raw Printify URL).
 */
export async function transparentizePrintifyMockups(apparelListingId: string): Promise<void> {
  const rows = await prisma.referencedVariant.findMany({
    where: { apparelListingId, mockupUrl: { not: null } },
    select: { mockupUrl: true },
  });
  // Distinct raw Printify mockup URLs (a mockup is shared across an offered colour's sizes).
  const urls = [...new Set(rows.map((r) => r.mockupUrl!).filter(isRawPrintifyMockup))];

  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const input = Buffer.from(await resp.arrayBuffer());
      const png = await removeWhiteBackground(input);
      const blob = await put(`apparel/printify-mockups/${crypto.randomUUID()}.png`, png, {
        access: "public",
        contentType: "image/png",
        token: BLOB_TOKEN,
      });
      // Point every variant that shared this raw mockup at the transparent version.
      await prisma.referencedVariant.updateMany({
        where: { apparelListingId, mockupUrl: url },
        data: { mockupUrl: blob.url },
      });
    } catch (err) {
      console.error(`[printify] mockup background removal failed for ${url}:`, err);
    }
  }
}
