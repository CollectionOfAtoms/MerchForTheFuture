"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type ActionResult = { id: string } | { error: string };

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
    const [activeColors, activeSizes] = await Promise.all([
      prisma.productTypeColor.count({ where: { productTypeId: id, isActive: true } }),
      prisma.productTypeSizeOption.count({ where: { productTypeId: id, isActive: true } }),
    ]);
    if (activeColors === 0) return { error: "At least one active color is required before activating a product type" };
    if (activeSizes === 0) return { error: "At least one active size is required before activating a product type" };
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
  const colorHex = (fd.get("colorHex") as string | null)?.trim() ?? "";
  const providerColorCode = (fd.get("providerColorCode") as string | null)?.trim() ?? "";

  if (!colorName) return { error: "Color name is required" };

  const color = await prisma.productTypeColor.create({
    data: { productTypeId, colorName, colorHex, providerColorCode },
  });

  revalidatePath(`/admin/products/${productTypeId}`);
  return { id: color.id };
}

// ─── toggleProductTypeColorAction ────────────────────────────────────────────

export async function toggleProductTypeColorAction(colorId: string, isActive: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const color = await prisma.productTypeColor.update({
    where: { id: colorId },
    data: { isActive },
  });

  revalidatePath(`/admin/products/${color.productTypeId}`);
  return { id: color.id };
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

export async function toggleProductTypeSizeAction(sizeId: string, isActive: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Unauthorized" };

  const size = await prisma.productTypeSizeOption.update({
    where: { id: sizeId },
    data: { isActive },
  });

  revalidatePath(`/admin/products/${size.productTypeId}`);
  return { id: size.id };
}
