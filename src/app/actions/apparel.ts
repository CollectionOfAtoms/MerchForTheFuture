"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type ActionResult = { error: string } | undefined;

const MAX_LIFESTYLE_PHOTOS = 10;

/** Returns the seller's user id, or null if the caller is not a signed-in seller. */
async function getSellerId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id || !user.roles?.includes("SELLER")) return null;
  return user.id;
}

// ─── createApparelListingAction ───────────────────────────────────────────────

export async function createApparelListingAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const productTypeId = (formData.get("productTypeId") as string | null)?.trim() ?? "";
  const designImageUrl = (formData.get("designImageUrl") as string | null)?.trim() ?? "";
  const retailPrice = parseFloat((formData.get("retailPrice") as string | null) ?? "");
  const intent = (formData.get("intent") as string | null) ?? "publish";
  const offeredColorIds = formData.getAll("offeredColorId").map(String).filter(Boolean);
  const lifestyleImageUrls = formData.getAll("lifestyleImageUrl").map(String).filter(Boolean);

  if (!title) return { error: "Title is required." };
  if (!productTypeId) return { error: "Please select a product type." };

  const productType = await prisma.productType.findUnique({
    where: { id: productTypeId },
    include: { colors: { select: { id: true } } },
  });
  if (!productType || !productType.isActive) {
    return { error: "Please select a valid product type." };
  }

  if (!designImageUrl) return { error: "A design file is required." };
  if (!isFinite(retailPrice) || retailPrice < 1) {
    return { error: "Retail price must be at least $1." };
  }
  if (offeredColorIds.length === 0) {
    return { error: "Select at least one color to offer." };
  }

  const validColorIds = new Set(productType.colors.map((c) => c.id));
  if (!offeredColorIds.every((id) => validColorIds.has(id))) {
    return { error: "Invalid color selection." };
  }
  if (lifestyleImageUrls.length > MAX_LIFESTYLE_PHOTOS) {
    return { error: `You can upload at most ${MAX_LIFESTYLE_PHOTOS} lifestyle photos.` };
  }

  const status = intent === "draft" ? "ARCHIVED" : "ACTIVE";

  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      productTypeId,
      title,
      description,
      retailPrice,
      status,
      designImageUrl,
      colors: {
        create: offeredColorIds.map((productTypeColorId) => ({
          productTypeColorId,
          isOffered: true,
        })),
      },
      images: {
        create: lifestyleImageUrls.map((originalUrl, i) => ({
          originalUrl,
          isPrimary: i === 0,
          sortOrder: i,
        })),
      },
    },
  });

  revalidatePath("/seller/listings");
  // Redirect to the edit page so the seller can review the listing and the
  // lifestyle-photo variants get generated client-side. The public storefront
  // page (/shop/[id]) arrives in Epic MFTF-6.
  redirect(`/seller/apparel/${listing.id}/edit`);
}
