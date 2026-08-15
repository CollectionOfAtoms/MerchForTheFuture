"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { syncDesignedProductTypeFromProdigi, prodigiProductExists } from "@/lib/apparel/sync-prodigi";
import {
  syncDesignedProductTypeFromPrintify,
  printifyBlueprintProviderExists,
} from "@/lib/apparel/sync-printify";

type ActionResult = { id: string } | { error: string };
type SyncResult = { error: string } | { sizes: number; colors: number };

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id || !user.roles?.includes("ADMIN")) return null;
  return user.id;
}

/**
 * Reject a designed SKU that Prodigi does not recognise, at submit time (BUG-16):
 * the seller is notified and no product type is persisted. Returns an error
 * message to surface, or null when the SKU is valid. A transport failure is
 * surfaced too (don't silently create an unverifiable product type).
 */
async function validateProdigiSku(providerSkuBase: string): Promise<string | null> {
  try {
    const exists = await prodigiProductExists(providerSkuBase);
    if (!exists) {
      return `No Prodigi product found for SKU "${providerSkuBase}". Check the SKU and try again.`;
    }
    return null;
  } catch {
    return "Could not reach Prodigi to verify the SKU. Please try again.";
  }
}

/** Parse a positive integer form field, or null if absent/invalid. */
function parseIntField(fd: FormData, key: string): number | null {
  const raw = (fd.get(key) as string | null)?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Reject a Printify (blueprint, print_provider) pair Printify does not recognise, at
 * submit time (BUG-16 precedent). Returns an error message to surface, or null when
 * the pair is valid. A transport failure is surfaced too.
 */
async function validatePrintifyPair(blueprintId: number, printProviderId: number): Promise<string | null> {
  try {
    const exists = await printifyBlueprintProviderExists(blueprintId, printProviderId);
    if (!exists) {
      return `No Printify variants found for blueprint ${blueprintId} / print provider ${printProviderId}. Check the ids and try again.`;
    }
    return null;
  } catch {
    return "Could not reach Printify to verify the blueprint/provider pair. Please try again.";
  }
}

// ─── createProductTypeAction ──────────────────────────────────────────────────

export async function createProductTypeAction(fd: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const name = (fd.get("name") as string | null)?.trim() ?? "";
  const description = (fd.get("description") as string | null)?.trim() || null;
  const fulfillmentProvider = (fd.get("fulfillmentProvider") as string | null)?.trim() ?? "";
  const providerSkuBase = (fd.get("providerSkuBase") as string | null)?.trim() ?? "";
  const printifyBlueprintId = parseIntField(fd, "printifyBlueprintId");
  const printifyPrintProviderId = parseIntField(fd, "printifyPrintProviderId");
  const isActive = fd.get("isActive") === "true";

  if (!name) return { error: "Product type name is required" };
  // Designed product types are Prodigi- or Printify-backed (US-MFTF-16.1 / 17.2).
  // Teemill is a REFERENCED source and bypasses the MFTF-4 designed catalog; the
  // enum retains TEEMILL but it is UI-blocked here and rejected to guard direct calls.
  if (fulfillmentProvider !== "PRODIGI" && fulfillmentProvider !== "PRINTIFY") {
    return { error: "Teemill is a referenced source and cannot back a designed product type" };
  }
  if (fulfillmentProvider === "PRODIGI" && !providerSkuBase) {
    return { error: "Provider SKU base is required" };
  }
  if (fulfillmentProvider === "PRINTIFY" && (printifyBlueprintId == null || printifyPrintProviderId == null)) {
    return { error: "Printify blueprint id and print provider id are required" };
  }

  const existing = await prisma.productType.findUnique({ where: { name } });
  if (existing) return { error: `A product type named "${name}" already exists` };

  if (fulfillmentProvider === "PRODIGI") {
    const skuError = await validateProdigiSku(providerSkuBase);
    if (skuError) return { error: skuError };
  } else {
    const pairError = await validatePrintifyPair(printifyBlueprintId!, printifyPrintProviderId!);
    if (pairError) return { error: pairError };
  }

  const pt = await prisma.productType.create({
    data:
      fulfillmentProvider === "PRINTIFY"
        ? { name, description, fulfillmentProvider: "PRINTIFY", printifyBlueprintId, printifyPrintProviderId, isActive }
        : { name, description, fulfillmentProvider: "PRODIGI", providerSkuBase, isActive },
  });

  // Pull sizes + colours (+ the Printify combo map) from the provider immediately
  // (best-effort — never fail creation if the provider is unreachable; the admin can
  // re-run the per-product "Sync" action on the edit page).
  try {
    if (fulfillmentProvider === "PRINTIFY") await syncDesignedProductTypeFromPrintify(pt.id);
    else await syncDesignedProductTypeFromProdigi(pt.id);
  } catch (e) {
    console.error("[product-catalog] auto-sync on create failed:", e);
  }

  revalidatePath("/admin/products");
  return { id: pt.id };
}

// ─── updateProductTypeAction ──────────────────────────────────────────────────

export async function updateProductTypeAction(id: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const existing = await prisma.productType.findUnique({ where: { id } });
  if (!existing) return { error: "Product type not found" };

  const name = (fd.get("name") as string | null)?.trim() ?? "";
  const description = (fd.get("description") as string | null)?.trim() || null;
  const fulfillmentProvider = (fd.get("fulfillmentProvider") as string | null)?.trim() ?? "";
  const providerSkuBase = (fd.get("providerSkuBase") as string | null)?.trim() ?? "";
  const printifyBlueprintId = parseIntField(fd, "printifyBlueprintId");
  const printifyPrintProviderId = parseIntField(fd, "printifyPrintProviderId");
  const isActive = fd.get("isActive") === "true";

  if (!name) return { error: "Product type name is required" };
  // Designed product types are Prodigi- or Printify-backed (US-MFTF-16.1 / 17.2).
  if (fulfillmentProvider !== "PRODIGI" && fulfillmentProvider !== "PRINTIFY") {
    return { error: "Teemill is a referenced source and cannot back a designed product type" };
  }
  if (fulfillmentProvider === "PRODIGI" && !providerSkuBase) {
    return { error: "Provider SKU base is required" };
  }
  if (fulfillmentProvider === "PRINTIFY" && (printifyBlueprintId == null || printifyPrintProviderId == null)) {
    return { error: "Printify blueprint id and print provider id are required" };
  }

  const nameConflict = await prisma.productType.findFirst({ where: { name, NOT: { id } } });
  if (nameConflict) return { error: `A product type named "${name}" already exists` };

  if (isActive && !existing.isActive) {
    const colorCount = await prisma.productTypeColor.count({ where: { productTypeId: id } });
    if (colorCount === 0) return { error: "At least one color is required before activating a product type" };
  }

  if (fulfillmentProvider === "PRODIGI") {
    const skuError = await validateProdigiSku(providerSkuBase);
    if (skuError) return { error: skuError };
  } else {
    const pairError = await validatePrintifyPair(printifyBlueprintId!, printifyPrintProviderId!);
    if (pairError) return { error: pairError };
  }

  const pt = await prisma.productType.update({
    where: { id },
    data:
      fulfillmentProvider === "PRINTIFY"
        ? { name, description, fulfillmentProvider: "PRINTIFY", providerSkuBase: null, printifyBlueprintId, printifyPrintProviderId, isActive }
        : { name, description, fulfillmentProvider: "PRODIGI", providerSkuBase, printifyBlueprintId: null, printifyPrintProviderId: null, isActive },
  });

  revalidatePath("/admin/products");
  return { id: pt.id };
}

// ─── addProductTypeColorAction ────────────────────────────────────────────────

export async function addProductTypeColorAction(productTypeId: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const existing = await prisma.productType.findUnique({ where: { id: productTypeId } });
  if (!existing) return { error: "Product type not found" };

  const colorName = (fd.get("colorName") as string | null)?.trim() ?? "";
  const providerColorCode = (fd.get("providerColorCode") as string | null)?.trim() ?? "";

  if (!colorName) return { error: "Color name is required" };

  const color = await prisma.productTypeColor.create({
    data: { productTypeId, colorName, providerColorCode },
  });

  revalidatePath(`/admin/products/${productTypeId}`);
  return { id: color.id };
}

// ─── toggleProductTypeColorAction ────────────────────────────────────────────
// NOTE: ProductTypeColor no longer has an isActive field — all colors are always
// available. This action is retained for API compatibility but is effectively a
// no-op (it verifies the color exists and revalidates the page).

export async function toggleProductTypeColorAction(colorId: string, _active: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const color = await prisma.productTypeColor.findUnique({ where: { id: colorId } });
  if (!color) return { error: "Color not found" };

  revalidatePath(`/admin/products/${color.productTypeId}`);
  return { id: color.id };
}

// ─── syncProductTypeFromProdigiAction ─────────────────────────────────────────
// Per-product: pull THIS designed (Prodigi) product type's sizes + colours from
// the live Prodigi catalog (sizes replaced; colours added additively). Surfaced as
// the "Sync from Prodigi" button on the product edit page; also auto-run once at
// creation (see createProductTypeAction).

export async function syncProductTypeFromProdigiAction(productTypeId: string): Promise<SyncResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const result = await syncDesignedProductTypeFromProdigi(productTypeId);
  revalidatePath(`/admin/products/${productTypeId}`);
  if (!result.ok) return { error: result.reason };
  return { sizes: result.sizes.length, colors: result.colors.length };
}

// ─── syncProductTypeFromPrintifyAction ────────────────────────────────────────
// Per-product: pull THIS designed (Printify) product type's sizes, colours and the
// (colour,size)→variant-id map from the curated (blueprint, print_provider) pair.
// Surfaced as the "Sync from Printify" button on the product edit page; also auto-run
// once at creation (see createProductTypeAction).

export async function syncProductTypeFromPrintifyAction(productTypeId: string): Promise<SyncResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const result = await syncDesignedProductTypeFromPrintify(productTypeId);
  revalidatePath(`/admin/products/${productTypeId}`);
  if (!result.ok) return { error: result.reason };
  return { sizes: result.sizes.length, colors: result.colors.length };
}

// ─── addProductTypeSizeAction ─────────────────────────────────────────────────

export async function addProductTypeSizeAction(productTypeId: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const existing = await prisma.productType.findUnique({ where: { id: productTypeId } });
  if (!existing) return { error: "Product type not found" };

  const sizeLabel = (fd.get("sizeLabel") as string | null)?.trim() ?? "";
  const providerSizeCode = (fd.get("providerSizeCode") as string | null)?.trim() ?? "";
  const sortOrder = parseInt(fd.get("sortOrder") as string ?? "0", 10);

  if (!sizeLabel) return { error: "Size label is required" };

  const size = await prisma.productTypeSizeOption.create({
    data: { productTypeId, sizeLabel, providerSizeCode, sortOrder },
  });

  revalidatePath(`/admin/products/${productTypeId}`);
  return { id: size.id };
}

// ─── toggleProductTypeSizeAction ─────────────────────────────────────────────
// NOTE: ProductTypeSizeOption no longer has an isActive field — all sizes are
// always available. This action is retained for API compatibility but is a no-op.

export async function toggleProductTypeSizeAction(sizeId: string, _active: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const size = await prisma.productTypeSizeOption.findUnique({ where: { id: sizeId } });
  if (!size) return { error: "Size not found" };

  revalidatePath(`/admin/products/${size.productTypeId}`);
  return { id: size.id };
}

// ─── updateProductTypeBlankImageAction ───────────────────────────────────────

/** Save (or clear) the admin-uploaded blank image for a product type. */
export async function updateProductTypeBlankImageAction(
  id: string,
  blankImageUrl: string | null,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const existing = await prisma.productType.findUnique({ where: { id } });
  if (!existing) return { error: "Product type not found" };

  const pt = await prisma.productType.update({
    where: { id },
    data: { blankImageUrl },
  });

  revalidatePath(`/admin/products/${id}`);
  return { id: pt.id };
}
