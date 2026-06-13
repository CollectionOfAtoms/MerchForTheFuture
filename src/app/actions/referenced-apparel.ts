"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ingestTeemillProduct, applyTeemillSnapshot } from "@/lib/fulfillment/teemill";
import {
  referencedListingColors,
  referencedListingSizes,
} from "@/lib/apparel/referenced";

type ActionResult = { error: string } | undefined;

const MAX_LIFESTYLE_PHOTOS = 10;

/** Returns the seller's user id, or null if the caller is not a signed-in seller. */
async function getSellerId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id || !user.roles?.includes("SELLER")) return null;
  return user.id;
}

// ─── resolveTeemillRefAction (Step 1 preview) ─────────────────────────────────

export interface ReferencedPreview {
  title: string;
  providerBaseCurrency: string;
  providerBasePrice: number;
  colors: { colorName: string; colorHex: string }[];
  sizes: string[];
  mockups: string[];
  orderableCount: number;
}

export type ResolveResult = { error: string } | { preview: ReferencedPreview };

/**
 * Resolves a pasted Teemill ref into a preview for Step 1 of the create form.
 * Errors (unresolvable / disabled / auth) are returned so the form can re-surface
 * the "design on Teemill first, then copy the ref" guidance.
 */
export async function resolveTeemillRefAction(productRef: string): Promise<ResolveResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const ingest = await ingestTeemillProduct((productRef ?? "").trim());
  if (!ingest.ok) return { error: ingest.error };

  const { snapshot } = ingest;
  const mockups = [
    ...new Set(snapshot.variants.map((v) => v.mockupUrl).filter((u): u is string => Boolean(u))),
  ];
  return {
    preview: {
      title: snapshot.title,
      providerBaseCurrency: snapshot.providerBaseCurrency,
      providerBasePrice: snapshot.providerBasePrice,
      colors: referencedListingColors(snapshot.variants),
      sizes: referencedListingSizes(snapshot.variants),
      mockups,
      orderableCount: snapshot.variants.filter((v) => v.isOrderable).length,
    },
  };
}

// ─── createReferencedListingAction ────────────────────────────────────────────

export async function createReferencedListingAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const providerProductRef = (formData.get("providerProductRef") as string | null)?.trim() ?? "";
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const retailPrice = parseFloat((formData.get("retailPrice") as string | null) ?? "");
  const intent = (formData.get("intent") as string | null) ?? "publish";
  const lifestyleImageUrls = formData.getAll("lifestyleImageUrl").map(String).filter(Boolean);

  if (!title) return { error: "Title is required." };
  if (!providerProductRef) {
    return {
      error:
        "Paste your Teemill product link or ref. Create the design on Teemill first, then copy its link.",
    };
  }
  if (!isFinite(retailPrice) || retailPrice < 1) {
    return { error: "Retail price must be at least $1." };
  }
  if (lifestyleImageUrls.length > MAX_LIFESTYLE_PHOTOS) {
    return { error: `You can upload at most ${MAX_LIFESTYLE_PHOTOS} lifestyle photos.` };
  }

  const ingest = await ingestTeemillProduct(providerProductRef);
  if (!ingest.ok) {
    return {
      error: `${ingest.error} Create the design on Teemill first, then copy its product link and paste it here.`,
    };
  }
  const { snapshot } = ingest;
  if (!snapshot.variants.some((v) => v.isOrderable)) {
    return { error: "That Teemill product has no orderable variants in stock right now." };
  }

  const status = intent === "draft" ? "ARCHIVED" : "ACTIVE";

  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      productTypeId: null,
      designImageUrl: null,
      title,
      description,
      retailPrice,
      status,
      providerKey: snapshot.providerKey,
      providerProductRef,
      images: {
        create: lifestyleImageUrls.map((originalUrl, i) => ({
          originalUrl,
          isPrimary: i === 0,
          sortOrder: i,
        })),
      },
    },
  });

  // Cache the variant snapshot + provider base price / currency / fetchedAt.
  await applyTeemillSnapshot(listing.id, snapshot);

  revalidatePath("/seller/listings");
  redirect(`/seller/apparel/${listing.id}/edit`);
}
