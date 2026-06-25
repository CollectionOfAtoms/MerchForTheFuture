"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath, refresh } from "next/cache";

type ActionResult = { error: string } | { success: true };

async function requireAuthUser() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  return { id: user.id, roles: user.roles ?? [] };
}

export async function updateProfileAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const { id: userId, roles } = await requireAuthUser();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required." };
  await prisma.user.update({ where: { id: userId }, data: { name } });
  if (roles.includes("ADMIN")) {
    revalidatePath("/admin/settings");
  } else if (roles.includes("SELLER")) {
    revalidatePath("/seller/settings");
  } else {
    revalidatePath("/buyer/settings");
  }
  refresh();
  return { success: true };
}

export async function updateSellerNotificationPrefsAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) return { error: "Forbidden." };

  const bidReceivedEmails = formData.get("bidReceivedEmails") === "true";
  const saleCompletedEmails = formData.get("saleCompletedEmails") === "true";

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const existing = (dbUser?.loginMetadata as Record<string, unknown> | null) ?? {};
  await prisma.user.update({
    where: { id: user.id },
    data: { loginMetadata: { ...existing, notifications: { bidReceivedEmails, saleCompletedEmails } } },
  });
  revalidatePath("/seller/settings");
  return { success: true };
}

export async function addAddressAction(formData: FormData): Promise<ActionResult> {
  const { id: userId } = await requireAuthUser();
  const name = (formData.get("name") as string)?.trim();
  const line1 = (formData.get("line1") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const postal = (formData.get("postal") as string)?.trim();
  if (!name || !line1 || !city || !postal) return { error: "Required fields missing." };

  const existing = await prisma.userAddress.findMany({ where: { userId } });
  const isFirst = existing.length === 0;

  await prisma.userAddress.create({
    data: {
      userId,
      name,
      line1,
      line2: (formData.get("line2") as string)?.trim() || null,
      city,
      state: (formData.get("state") as string)?.trim() || null,
      postal,
      country: (formData.get("country") as string)?.trim() || "US",
      isDefault: isFirst,
    },
  });
  revalidatePath("/buyer/settings");
  return { success: true };
}

export async function updateAddressAction(addressId: string, formData: FormData): Promise<ActionResult> {
  const { id: userId } = await requireAuthUser();
  const address = await prisma.userAddress.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== userId) return { error: "Not found." };

  await prisma.userAddress.update({
    where: { id: addressId },
    data: {
      name: (formData.get("name") as string)?.trim() ?? address.name,
      line1: (formData.get("line1") as string)?.trim() ?? address.line1,
      line2: (formData.get("line2") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() ?? address.city,
      state: (formData.get("state") as string)?.trim() || null,
      postal: (formData.get("postal") as string)?.trim() ?? address.postal,
      country: (formData.get("country") as string)?.trim() ?? address.country,
    },
  });
  revalidatePath("/buyer/settings");
  return { success: true };
}

export async function deleteAddressAction(addressId: string): Promise<ActionResult> {
  const { id: userId } = await requireAuthUser();
  const address = await prisma.userAddress.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== userId) return { error: "Not found." };
  await prisma.userAddress.delete({ where: { id: addressId } });
  revalidatePath("/buyer/settings");
  return { success: true };
}

export async function setDefaultAddressAction(addressId: string): Promise<ActionResult> {
  const { id: userId } = await requireAuthUser();
  const address = await prisma.userAddress.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== userId) return { error: "Not found." };

  await prisma.$transaction([
    prisma.userAddress.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.userAddress.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
  revalidatePath("/buyer/settings");
  return { success: true };
}

export async function updateCurrencyPreferenceAction(formData: FormData): Promise<ActionResult> {
  const { id: userId } = await requireAuthUser();
  const { getSupportedCurrencies } = await import("@/lib/tax/currency");
  const currency = (formData.get("currency") as string)?.trim();
  if (!currency || !getSupportedCurrencies().includes(currency)) {
    return { error: "Unsupported currency." };
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const existing = (user?.loginMetadata as Record<string, unknown> | null) ?? {};
  const existingPrefs = (existing.preferences as Record<string, unknown> | undefined) ?? {};
  await prisma.user.update({
    where: { id: userId },
    data: { loginMetadata: { ...existing, preferences: { ...existingPrefs, currency } } },
  });
  revalidatePath("/buyer/settings");
  return { success: true };
}

export async function updateNotificationPrefsAction(formData: FormData): Promise<ActionResult> {
  const { id: userId } = await requireAuthUser();
  const outbidEmails = formData.getAll("outbidEmails").includes("true");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const existing = (user?.loginMetadata as Record<string, unknown> | null) ?? {};
  await prisma.user.update({
    where: { id: userId },
    data: { loginMetadata: { ...existing, notifications: { outbidEmails } } },
  });
  revalidatePath("/buyer/settings");
  return { success: true };
}
