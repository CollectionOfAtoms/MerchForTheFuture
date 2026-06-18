"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { syncDesignedAttributesFromProdigi } from "@/lib/apparel/sync-prodigi";

type ActionResult = { id: string } | { error: string };
type SyncResult = { error: string } | { synced: number; total: number };

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id || !user.roles?.includes("ADMIN")) return null;
  return user.id;
}

// ─── createProductTypeAction ──────────────────────────────────────────────────

export async function createProductTypeAction(fd: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const name = (fd.get("name") as string | null)?.trim() ?? "";
  const description = (fd.get("description") as string | null)?.trim() || null;
  const fulfillmentProvider = (fd.get("fulfillmentProvider") as string | null)?.trim() ?? "";
  const providerSkuBase = (fd.get("providerSkuBase") as string | null)?.trim() ?? "";
  const isActive = fd.get("isActive") === "true";

  if (!name) return { error: "Product type name is required" };
  if (!providerSkuBase) return { error: "Provider SKU base is required" };
  if (fulfillmentProvider !== "TEEMILL" && fulfillmentProvider !== "PRODIGI") {
    return { error: "Invalid fulfillment provider" };
  }

  const existing = await prisma.productType.findUnique({ where: { name } });
  if (existing) return { error: `A product type named "${name}" already exists` };

  const pt = await prisma.productType.create({
    data: { name, description, fulfillmentProvider: fulfillmentProvider as "TEEMILL" | "PRODIGI", providerSkuBase, isActive },
  });

  const teemillColorsRaw = (fd.get("teemillColorsJson") as string | null)?.trim();
  if (teemillColorsRaw) {
    try {
      const colors: { name: string; imageUrl: string }[] = JSON.parse(teemillColorsRaw);
      if (Array.isArray(colors) && colors.length > 0) {
        await prisma.productTypeColor.createMany({
          data: colors.map((c) => ({
            productTypeId: pt.id,
            colorName: c.name,
            providerColorCode: c.name,
            colorImageUrl: c.imageUrl || null,
          })),
        });
      }
    } catch {
      // Malformed JSON — skip color seeding; admin can add colors manually
    }
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
  const isActive = fd.get("isActive") === "true";

  if (!name) return { error: "Product type name is required" };
  if (!providerSkuBase) return { error: "Provider SKU base is required" };
  if (fulfillmentProvider !== "TEEMILL" && fulfillmentProvider !== "PRODIGI") {
    return { error: "Invalid fulfillment provider" };
  }

  const nameConflict = await prisma.productType.findFirst({ where: { name, NOT: { id } } });
  if (nameConflict) return { error: `A product type named "${name}" already exists` };

  if (isActive && !existing.isActive) {
    const colorCount = await prisma.productTypeColor.count({ where: { productTypeId: id } });
    if (colorCount === 0) return { error: "At least one color is required before activating a product type" };
  }

  const pt = await prisma.productType.update({
    where: { id },
    data: { name, description, fulfillmentProvider: fulfillmentProvider as "TEEMILL" | "PRODIGI", providerSkuBase, isActive },
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

// ─── syncDesignedFromProdigiAction ────────────────────────────────────────────
// One-click sync of ALL designed (Prodigi) product types' sizes AND colours from
// the live Prodigi catalog. Prodigi has no bulk-list endpoint, so this enumerates
// our own designed product types and fetches each blank — no manual SKU list.
// Safe to re-run (sizes replaced; colours added additively); also cron-friendly.

export async function syncDesignedFromProdigiAction(): Promise<SyncResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const result = await syncDesignedAttributesFromProdigi();
  revalidatePath("/admin/products");
  return { synced: result.synced.length, total: result.total };
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
