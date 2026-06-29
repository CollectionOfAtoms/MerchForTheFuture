"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import {
  isSelectableWrap,
  offeredAspects,
  upsertFraming,
  upsertSizeMockup,
  removeSizeMockup,
  getPrintReadiness,
  itemizePrintReadiness,
  invalidateFramingForArtwork,
} from "@/lib/print/framing";
import { generatePrintCrop, generateWatermarkedMockup } from "@/lib/artworks/variants";
import { getActor, canManageListing, type Actor } from "@/lib/seller/authz";

type ActionResult = { error: string } | { success: true } | undefined;

/** Creating a listing requires a SELLER (the new listing's owner). */
async function requireSeller() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");
  return user.id;
}

/**
 * Managing an existing listing requires a SELLER or an ADMIN; per-listing
 * authorization is then checked with canManageListing (owner seller, or any admin).
 */
async function requireManager(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (!actor.roles.includes("SELLER") && !actor.roles.includes("ADMIN")) redirect("/");
  return actor;
}

export async function createListingAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const sellerId = await requireSeller();

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const saleType = formData.get("saleType") as string;
  const currency = "USD";

  const imageUrls = formData.getAll("imageUrl").map(String).filter(Boolean);

  const artist = (formData.get("artist") as string)?.trim();
  const medium = (formData.get("medium") as string)?.trim();
  const dimensionW = parseFloat(formData.get("dimensionW") as string);
  const dimensionH = parseFloat(formData.get("dimensionH") as string);
  const dimensionUnit = formData.get("dimensionUnit") as string;

  if (!title) return { error: "Title is required." };
  if (!artist) return { error: "Artist is required." };
  if (!description) return { error: "Description is required." };
  if (!medium) return { error: "Medium is required." };
  if (!isFinite(dimensionW) || dimensionW <= 0) return { error: "Width must be a positive number." };
  if (!isFinite(dimensionH) || dimensionH <= 0) return { error: "Height must be a positive number." };
  if (!["in", "cm"].includes(dimensionUnit)) return { error: "Invalid dimension unit." };
  if (!["FIXED_PRICE", "AUCTION"].includes(saleType)) return { error: "Invalid sale type." };
  if (imageUrls.length === 0) return { error: "At least one photo is required." };

  const dimensions = `${dimensionW}×${dimensionH} ${dimensionUnit}`;

  const artwork = await prisma.artwork.create({
    data: {
      sellerId,
      title,
      description,
      status: "DRAFT",
      artist,
      medium,
      dimensions,
      year: formData.get("year") ? parseInt(formData.get("year") as string, 10) : null,
    },
  });

  await prisma.artworkImage.createMany({
    data: imageUrls.map((url, i) => ({
      artworkId: artwork.id,
      url,
      isPrimary: i === 0,
      order: i,
    })),
  });

  if (saleType === "FIXED_PRICE") {
    const price = parseFloat(formData.get("price") as string);
    if (!price || price <= 0) return { error: "Price must be greater than zero." };

    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price, currency, status: "ACTIVE" },
    });

    await prisma.artwork.update({ where: { id: artwork.id }, data: { status: "PUBLISHED" } });
    revalidatePath("/seller/listings");
    redirect(`/seller/listings/${listing.id}/edit`);
  }

  if (saleType === "AUCTION") {
    const startBid = parseFloat(formData.get("startBid") as string);
    const reservePrice = formData.get("reservePrice")
      ? parseFloat(formData.get("reservePrice") as string)
      : null;
    const endAtStr = formData.get("endAt") as string;

    if (!startBid || startBid <= 0) return { error: "Start bid must be greater than zero." };
    if (!endAtStr) return { error: "Auction end date is required." };

    const endAt = new Date(endAtStr);
    if (endAt.getTime() - Date.now() < 24 * 60 * 60 * 1000) {
      return { error: "Auction must end at least 24 hours from now." };
    }

    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", price: startBid, currency, status: "ACTIVE" },
    });

    await prisma.auction.create({
      data: { originalListingId: listing.id, startBid, reservePrice, endAt, status: "SCHEDULED" },
    });

    await prisma.artwork.update({ where: { id: artwork.id }, data: { status: "PUBLISHED" } });
    revalidatePath("/seller/listings");
    redirect(`/seller/listings/${listing.id}/edit`);
  }
}

export async function updateListingAction(
  listingId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true, auction: true },
  });

  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Description is required." };

  await prisma.artwork.update({
    where: { id: listing.artworkId },
    data: {
      title,
      description,
      artist: (formData.get("artist") as string)?.trim() || null,
      medium: (formData.get("medium") as string)?.trim() || null,
      dimensions: (() => {
        const w = parseFloat(formData.get("dimensionW") as string);
        const h = parseFloat(formData.get("dimensionH") as string);
        const u = formData.get("dimensionUnit") as string;
        return isFinite(w) && w > 0 && isFinite(h) && h > 0 && ["in", "cm"].includes(u)
          ? `${w}×${h} ${u}`
          : null;
      })(),
      year: formData.get("year") ? parseInt(formData.get("year") as string, 10) : null,
    },
  });

  if (listing.saleType === "FIXED_PRICE") {
    const price = parseFloat(formData.get("price") as string);
    if (!price || price <= 0) return { error: "Price must be greater than zero." };
    await prisma.originalListing.update({ where: { id: listingId }, data: { price } });
  }

  if (listing.saleType === "AUCTION" && listing.auction) {
    const reservePrice = formData.get("reservePrice")
      ? parseFloat(formData.get("reservePrice") as string)
      : null;
    await prisma.auction.update({ where: { id: listing.auction.id }, data: { reservePrice } });
  }

  revalidatePath("/seller/listings");
  revalidatePath(`/seller/listings/${listingId}/edit`);
  return { success: true };
}

export async function toggleListingStatusAction(listingId: string): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true, auction: { select: { bidCount: true } } },
  });

  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };
  if (listing.status === "SOLD") return { error: "A sold listing cannot change status." };
  if (listing.auction && (listing.auction.bidCount ?? 0) > 0) return { error: "An auction with bids cannot change status." };

  const next = listing.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
  // Hard gate (US-MFTF-PF.4): a prints-enabled listing can't go ACTIVE until every
  // offered aspect is framed and every offered size has a mockup.
  if (next === "ACTIVE" && listing.availableForPrint) {
    const readiness = await getPrintReadiness(listing.artworkId);
    if (!readiness.ready) {
      const products = Array.isArray(listing.printProducts)
        ? (listing.printProducts as { sku: string; size?: string }[])
        : [];
      return { error: itemizePrintReadiness(readiness, products) };
    }
  }
  await prisma.originalListing.update({ where: { id: listingId }, data: { status: next } });
  revalidatePath("/seller/listings");
  return { success: true };
}

/** Statuses a seller may set a listing to directly (live / pre-launch preview / retired). */
const SETTABLE_LISTING_STATUSES = ["ACTIVE", "UNLISTED", "ARCHIVED"] as const;
export type SettableListingStatus = (typeof SETTABLE_LISTING_STATUSES)[number];

/**
 * Set an artwork listing to ACTIVE (live), UNLISTED (viewable by direct link
 * only, hidden from feeds), or ARCHIVED (retired). No-op on SOLD listings, on
 * auctions that already have bids, for non-owners, and for unknown targets.
 */
export async function setListingStatusAction(
  listingId: string,
  status: SettableListingStatus,
): Promise<ActionResult> {
  const actor = await requireManager();
  if (!SETTABLE_LISTING_STATUSES.includes(status)) return { error: "Invalid status." };

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true, auction: { select: { bidCount: true } } },
  });

  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };
  if (listing.status === "SOLD") return { error: "A sold listing cannot change status." };
  if (listing.auction && (listing.auction.bidCount ?? 0) > 0) return { error: "An auction with bids cannot change status." };

  // Hard gate (US-MFTF-PF.4): block ACTIVE for an incomplete prints-enabled listing.
  if (status === "ACTIVE" && listing.availableForPrint) {
    const readiness = await getPrintReadiness(listing.artworkId);
    if (!readiness.ready) {
      const products = Array.isArray(listing.printProducts)
        ? (listing.printProducts as { sku: string; size?: string }[])
        : [];
      return { error: itemizePrintReadiness(readiness, products) };
    }
  }

  await prisma.originalListing.update({ where: { id: listingId }, data: { status } });
  revalidatePath("/seller/listings");
  return { success: true };
}

export async function deleteListingAction(listingId: string): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: {
      artwork: { include: { images: true } },
      auction: { select: { bidCount: true } },
    },
  });

  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Not found." };
  if (listing.status === "SOLD") return { error: "Cannot delete a sold listing." };
  if (listing.auction && (listing.auction.bidCount ?? 0) > 0) return { error: "Cannot delete an auction with active bids." };

  const imageUrls = listing.artwork.images.map((img) => img.url);
  if (imageUrls.length > 0) {
    try {
      await del(imageUrls, {
        token: process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch {
      // Non-fatal: blob may not exist; proceed with DB deletion
    }
  }

  await prisma.originalListing.delete({ where: { id: listingId } });
  await prisma.artwork.delete({ where: { id: listing.artworkId } });

  revalidatePath("/seller/listings");
  return { success: true };
}

export async function updatePrintConfigAction(
  listingId: string,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });

  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };

  const enable = formData.get("availableForPrint") === "true";

  if (enable) {
    const printSourceImageUrl = (formData.get("printSourceImageUrl") as string)?.trim();
    const printProductsRaw = (formData.get("printProducts") as string)?.trim();

    if (!printSourceImageUrl) return { error: "Source image URL is required when prints are enabled." };

    let printProducts: unknown;
    try {
      printProducts = JSON.parse(printProductsRaw || "[]");
    } catch {
      return { error: "Invalid print products format." };
    }

    if (!Array.isArray(printProducts) || printProducts.length === 0) {
      return { error: "At least one print product must be selected." };
    }

    // Decision E (US-MFTF-PF.4): replacing the print source art invalidates every
    // framing crop and forces a previously-ACTIVE listing out of active-eligible
    // state until the seller reframes.
    const sourceReplaced =
      !!listing.printSourceImageUrl && listing.printSourceImageUrl !== printSourceImageUrl;

    await prisma.originalListing.update({
      where: { id: listingId },
      data: {
        availableForPrint: true,
        printSourceImageUrl,
        printProducts: printProducts as never,
        ...(sourceReplaced && listing.status === "ACTIVE" ? { status: "UNLISTED" } : {}),
      },
    });

    if (sourceReplaced) {
      await invalidateFramingForArtwork(listing.artworkId);
    }
  } else {
    await prisma.originalListing.update({
      where: { id: listingId },
      data: { availableForPrint: false },
    });
  }

  revalidatePath(`/seller/listings/${listingId}/edit`);
  revalidatePath(`/artwork/${listing.artworkId}`);
  return { success: true };
}

/**
 * Persist the seller's canvas edge-wrap choice for one offered canvas aspect
 * (US-MFTF-PF.2). The wrap is validated server-side against the selectable set —
 * `IMAGE_WRAP` and any out-of-set value are rejected (defence in depth: the
 * `CanvasWrap` enum still contains `IMAGE_WRAP`, so the guard is application-layer).
 * Only canvas aspects the listing actually offers accept a wrap; paper aspects do not.
 */
export async function setCanvasWrapAction(
  listingId: string,
  aspectRatio: string,
  wrap: string,
): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });
  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };

  if (!isSelectableWrap(wrap)) return { error: "Invalid wrap selection." };

  const products = Array.isArray(listing.printProducts)
    ? (listing.printProducts as { sku: string; size?: string }[])
    : [];
  const canvasAspect = offeredAspects(products).find(
    (a) => a.aspectRatio === aspectRatio && a.isCanvas,
  );
  if (!canvasAspect) return { error: "That aspect is not an offered canvas size." };

  await upsertFraming(listing.artworkId, aspectRatio, { wrap });

  revalidatePath(`/seller/listings/${listingId}/edit`);
  return { success: true };
}

/**
 * Persist a buyer-facing mockup for one offered print size (US-MFTF-PF.6). The image
 * is uploaded client-side to Blob (same pipeline as other listing images, which
 * validates type/size); this action validates ownership + that the size is offered and
 * applies the small **corner** brand mark via the Sharp pipeline, and writes the
 * watermarked result to `PrintSizeMockup.mockupUrl` keyed by `[artworkId, sizeSku]`.
 * Mockups are buyer DISPLAY assets only — never sent to Prodigi; the corner mark gives
 * brand identification without degrading the promotional image (never the diagonal
 * original-protection overlay).
 */
export async function setSizeMockupAction(
  listingId: string,
  sizeSku: string,
  mockupUrl: string,
): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });
  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };

  if (!mockupUrl || !/^https?:\/\//.test(mockupUrl)) return { error: "A valid mockup image URL is required." };

  const products = Array.isArray(listing.printProducts)
    ? (listing.printProducts as { sku: string }[])
    : [];
  if (!products.some((p) => p.sku === sizeSku)) return { error: "That size is not offered by this listing." };

  let watermarkedUrl: string;
  try {
    watermarkedUrl = await generateWatermarkedMockup(
      mockupUrl,
      `print-mockups/${listing.artworkId}/${sizeSku.replace(/[^a-zA-Z0-9-]/g, "_")}`,
    );
  } catch (err) {
    console.error("[setSizeMockupAction] mockup watermarking failed:", err);
    return { error: "Could not process the mockup image. Please try again." };
  }

  await upsertSizeMockup(listing.artworkId, sizeSku, watermarkedUrl);

  revalidatePath(`/seller/listings/${listingId}/edit`);
  revalidatePath(`/artwork/${listing.artworkId}`);
  return { success: true };
}

/** Remove a size's buyer mockup (US-MFTF-PF.6); the PF.4 gate then blocks ACTIVE until re-supplied. */
export async function removeSizeMockupAction(listingId: string, sizeSku: string): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });
  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };

  await removeSizeMockup(listing.artworkId, sizeSku);

  revalidatePath(`/seller/listings/${listingId}/edit`);
  revalidatePath(`/artwork/${listing.artworkId}`);
  return { success: true };
}

/**
 * Crop the print source to one offered aspect and persist it (US-MFTF-PF.3). Takes
 * the normalized `[0..1]` rect from the framing tool, crops via the Sharp pipeline to
 * the exact aspect, stores the result in Blob, and writes `PrintFraming.croppedUrl` +
 * the rect, clearing `needsReframe` for that aspect. The cropped asset is the
 * production file sent to Prodigi (US-MFTF-PF.5).
 */
export async function confirmFramingAction(
  listingId: string,
  aspectRatio: string,
  rect: { x: number; y: number; w: number; h: number },
): Promise<ActionResult> {
  const actor = await requireManager();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });
  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };

  const source = listing.printSourceImageUrl;
  if (!source) return { error: "Set a print source image before framing." };

  const products = Array.isArray(listing.printProducts)
    ? (listing.printProducts as { sku: string; size?: string }[])
    : [];
  if (!offeredAspects(products).some((a) => a.aspectRatio === aspectRatio)) {
    return { error: "That aspect is not offered by this listing." };
  }

  const within01 = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (![rect.x, rect.y, rect.w, rect.h].every(within01) || rect.w <= 0 || rect.h <= 0) {
    return { error: "Invalid crop region." };
  }

  let croppedUrl: string;
  try {
    croppedUrl = await generatePrintCrop(
      source,
      rect,
      `print-crops/${listing.artworkId}/${aspectRatio.replace(":", "x")}`,
    );
  } catch (err) {
    console.error("[confirmFramingAction] crop failed:", err);
    return { error: "Could not generate the cropped image. Please try again." };
  }

  await upsertFraming(listing.artworkId, aspectRatio, {
    croppedUrl,
    cropX: rect.x,
    cropY: rect.y,
    cropW: rect.w,
    cropH: rect.h,
    needsReframe: false,
  });

  revalidatePath(`/seller/listings/${listingId}/edit`);
  revalidatePath(`/artwork/${listing.artworkId}`);
  return { success: true };
}
