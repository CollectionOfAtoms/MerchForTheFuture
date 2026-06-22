/**
 * Print framing + per-size mockup data layer (Epic MFTF-PF).
 *
 * Prints attach to an artwork 1:1 via its `OriginalListing`, so both the per-aspect
 * framing crop (`PrintFraming`, the production file sent to Prodigi) and the per-size
 * buyer mockup (`PrintSizeMockup`, display only — never sent to Prodigi) are keyed by
 * `artworkId`. One aspect crop serves every offered size of that aspect; each size
 * still gets its own mockup.
 */
import { prisma } from "@/lib/db";
import type { CanvasWrap, PrintFraming, PrintSizeMockup } from "@/generated/prisma/client";
import { getPrintCatalog, parseArtworkDimensions } from "@/lib/print/listing";

// ─── Canvas wrap constants (US-MFTF-PF.2 / PF.5) ──────────────────────────────

/**
 * The wraps a seller may pick (US-MFTF-PF.2). `IMAGE_WRAP` is deliberately excluded
 * — the enum still contains it (no migration needed to re-allow), so this list is
 * the single application-layer source of truth for the UI picker AND the server-side
 * guard.
 */
export const SELECTABLE_CANVAS_WRAPS: CanvasWrap[] = ["MIRROR_WRAP", "BLACK", "WHITE"];

/** Default wrap when none is stored (founder-ratified 2026-06-21). */
export const DEFAULT_CANVAS_WRAP: CanvasWrap = "MIRROR_WRAP";

/** Buyer/seller-facing labels for each wrap. */
export const WRAP_LABELS: Record<CanvasWrap, string> = {
  MIRROR_WRAP: "Mirror wrap",
  BLACK: "Black",
  WHITE: "White",
  IMAGE_WRAP: "Image wrap",
};

/** Prodigi `attributes.wrap` API value (PascalCase) for each enum member (US-MFTF-PF.5). */
export const WRAP_API_VALUE: Record<CanvasWrap, string> = {
  MIRROR_WRAP: "MirrorWrap",
  BLACK: "Black",
  WHITE: "White",
  IMAGE_WRAP: "ImageWrap",
};

/** True only for a wrap the seller is allowed to select (excludes IMAGE_WRAP). */
export function isSelectableWrap(value: string): value is CanvasWrap {
  return (SELECTABLE_CANVAS_WRAPS as string[]).includes(value);
}

// ─── Pure aspect / SKU helpers ────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Reduce width:height to lowest terms, e.g. (8,10) → "4:5", (16,20) → "4:5". */
export function aspectRatioKey(width: number, height: number): string {
  const w = Math.round(width);
  const h = Math.round(height);
  const g = gcd(w, h) || 1;
  return `${w / g}:${h / g}`;
}

/** Canvas SKUs (`GLOBAL-CAN-*`) have physical edges and a wrap; paper (`-FAP-`) does not. */
export function isCanvasSku(sku: string): boolean {
  return /(?:^|-)CAN-/i.test(sku);
}

export interface OfferedPrintProduct {
  sku: string;
  size?: string;
}

/**
 * The aspect-ratio key for one offered product — derived from its size label when
 * parseable (the form stores e.g. "8×10 in"), else from the static catalog by SKU.
 * Returns null only for an unparseable, uncatalogued SKU.
 */
export function aspectForProduct(product: OfferedPrintProduct): string | null {
  const dims = parseArtworkDimensions(product.size);
  if (dims) return aspectRatioKey(dims.widthIn, dims.heightIn);
  const entry = getPrintCatalog().find((c) => c.sku.toUpperCase() === product.sku.toUpperCase());
  if (entry) return aspectRatioKey(entry.productDimensions.width, entry.productDimensions.height);
  return null;
}

export interface OfferedAspect {
  aspectRatio: string;
  /** True when any offered canvas SKU has this aspect (drives the wrap picker). */
  isCanvas: boolean;
}

/** Distinct offered aspects across all products; canvas-flagged if any canvas SKU has it. */
export function offeredAspects(products: OfferedPrintProduct[]): OfferedAspect[] {
  const map = new Map<string, boolean>();
  for (const p of products) {
    const aspect = aspectForProduct(p);
    if (!aspect) continue;
    map.set(aspect, (map.get(aspect) ?? false) || isCanvasSku(p.sku));
  }
  return Array.from(map.entries()).map(([aspectRatio, isCanvas]) => ({ aspectRatio, isCanvas }));
}

/** Distinct offered size SKUs (the key space for per-size mockups). */
export function offeredSizes(products: OfferedPrintProduct[]): string[] {
  return Array.from(new Set(products.map((p) => p.sku)));
}

// ─── Framing CRUD ─────────────────────────────────────────────────────────────

export function getFramingForArtwork(artworkId: string): Promise<PrintFraming[]> {
  return prisma.printFraming.findMany({ where: { artworkId } });
}

export interface FramingUpsert {
  wrap?: CanvasWrap | null;
  croppedUrl?: string | null;
  cropX?: number | null;
  cropY?: number | null;
  cropW?: number | null;
  cropH?: number | null;
  needsReframe?: boolean;
}

/** Create or update the framing row for `[artworkId, aspectRatio]`; only supplied fields change. */
export function upsertFraming(
  artworkId: string,
  aspectRatio: string,
  data: FramingUpsert,
): Promise<PrintFraming> {
  return prisma.printFraming.upsert({
    where: { artworkId_aspectRatio: { artworkId, aspectRatio } },
    create: { artworkId, aspectRatio, ...data },
    update: { ...data },
  });
}

// ─── Mockup CRUD ──────────────────────────────────────────────────────────────

export function getMockupsForArtwork(artworkId: string): Promise<PrintSizeMockup[]> {
  return prisma.printSizeMockup.findMany({ where: { artworkId } });
}

export function upsertSizeMockup(
  artworkId: string,
  sizeSku: string,
  mockupUrl: string,
): Promise<PrintSizeMockup> {
  return prisma.printSizeMockup.upsert({
    where: { artworkId_sizeSku: { artworkId, sizeSku } },
    create: { artworkId, sizeSku, mockupUrl },
    update: { mockupUrl },
  });
}

export function removeSizeMockup(artworkId: string, sizeSku: string): Promise<unknown> {
  return prisma.printSizeMockup.deleteMany({ where: { artworkId, sizeSku } });
}

// ─── Readiness (gate predicate, consumed by US-MFTF-PF.4) ─────────────────────

export interface PrintReadiness {
  enabled: boolean;
  offeredAspects: OfferedAspect[];
  offeredSizes: string[];
  /** Offered aspects with a complete crop (croppedUrl present, needsReframe=false). */
  framedAspects: string[];
  /** Offered aspects still needing a crop (or with needsReframe=true). */
  missingAspects: string[];
  mockedSizes: string[];
  /** Offered sizes with no mockup yet. */
  missingSizes: string[];
  /** True when the listing may go/stay ACTIVE: not prints-enabled, or fully complete. */
  ready: boolean;
}

type PrintProductRow = { sku?: unknown; size?: unknown };

function normalizeProducts(raw: unknown): OfferedPrintProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is PrintProductRow => !!p && typeof p === "object")
    .map((p) => ({ sku: String(p.sku ?? ""), size: typeof p.size === "string" ? p.size : undefined }))
    .filter((p) => p.sku.length > 0);
}

export async function getPrintReadiness(artworkId: string): Promise<PrintReadiness> {
  const listing = await prisma.originalListing.findUnique({
    where: { artworkId },
    select: { availableForPrint: true, printProducts: true },
  });

  const enabled = !!listing?.availableForPrint;
  const products = normalizeProducts(listing?.printProducts);
  const aspects = offeredAspects(products);
  const sizes = offeredSizes(products);

  if (!enabled) {
    return {
      enabled: false,
      offeredAspects: aspects,
      offeredSizes: sizes,
      framedAspects: [],
      missingAspects: [],
      mockedSizes: [],
      missingSizes: [],
      ready: true,
    };
  }

  const [framings, mockups] = await Promise.all([
    getFramingForArtwork(artworkId),
    getMockupsForArtwork(artworkId),
  ]);

  const completeFraming = new Set(
    framings.filter((f) => f.croppedUrl && !f.needsReframe).map((f) => f.aspectRatio),
  );
  const mockedSet = new Set(mockups.map((m) => m.sizeSku));

  const framedAspects = aspects.filter((a) => completeFraming.has(a.aspectRatio)).map((a) => a.aspectRatio);
  const missingAspects = aspects.filter((a) => !completeFraming.has(a.aspectRatio)).map((a) => a.aspectRatio);
  const mockedSizes = sizes.filter((s) => mockedSet.has(s));
  const missingSizes = sizes.filter((s) => !mockedSet.has(s));

  return {
    enabled: true,
    offeredAspects: aspects,
    offeredSizes: sizes,
    framedAspects,
    missingAspects,
    mockedSizes,
    missingSizes,
    ready: missingAspects.length === 0 && missingSizes.length === 0,
  };
}

// ─── Strict one-time backfill (US-MFTF-PF.1) ──────────────────────────────────

/**
 * Flip any ACTIVE prints-enabled listing that is missing a crop for any offered
 * aspect OR a mockup for any offered size to ARCHIVED, and mark each unframed aspect
 * `needsReframe` so the seller is told why on return. Idempotent: a compliant
 * listing is untouched; a prints-disabled listing is never considered.
 */
export async function backfillPrintFramingArchive(): Promise<{ archivedListingIds: string[] }> {
  const listings = await prisma.originalListing.findMany({
    where: { status: "ACTIVE", availableForPrint: true },
    select: { id: true, artworkId: true },
  });

  const archivedListingIds: string[] = [];
  for (const listing of listings) {
    const readiness = await getPrintReadiness(listing.artworkId);
    if (readiness.ready) continue;

    await prisma.originalListing.update({ where: { id: listing.id }, data: { status: "ARCHIVED" } });
    for (const aspectRatio of readiness.missingAspects) {
      await upsertFraming(listing.artworkId, aspectRatio, { needsReframe: true });
    }
    archivedListingIds.push(listing.id);
  }

  return { archivedListingIds };
}
