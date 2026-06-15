"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";

type ActionResult = { error: string } | { success: true } | undefined;

async function requireSeller() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");
  return user.id;
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
  const sellerId = await requireSeller();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true, auction: true },
  });

  if (!listing || listing.artwork.sellerId !== sellerId) return { error: "Listing not found." };

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

export async function toggleListingStatusAction(listingId: string): Promise<void> {
  const sellerId = await requireSeller();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true, auction: { select: { bidCount: true } } },
  });

  if (!listing || listing.artwork.sellerId !== sellerId) return;
  if (listing.status === "SOLD") return;
  if (listing.auction && (listing.auction.bidCount ?? 0) > 0) return;

  const next = listing.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
  await prisma.originalListing.update({ where: { id: listingId }, data: { status: next } });
  revalidatePath("/seller/listings");
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
): Promise<void> {
  const sellerId = await requireSeller();
  if (!SETTABLE_LISTING_STATUSES.includes(status)) return;

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true, auction: { select: { bidCount: true } } },
  });

  if (!listing || listing.artwork.sellerId !== sellerId) return;
  if (listing.status === "SOLD") return;
  if (listing.auction && (listing.auction.bidCount ?? 0) > 0) return;

  await prisma.originalListing.update({ where: { id: listingId }, data: { status } });
  revalidatePath("/seller/listings");
}

export async function deleteListingAction(listingId: string): Promise<ActionResult> {
  const sellerId = await requireSeller();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: {
      artwork: { include: { images: true } },
      auction: { select: { bidCount: true } },
    },
  });

  if (!listing || listing.artwork.sellerId !== sellerId) return { error: "Not found." };
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
  const sellerId = await requireSeller();

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });

  if (!listing || listing.artwork.sellerId !== sellerId) return { error: "Listing not found." };

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

    await prisma.originalListing.update({
      where: { id: listingId },
      data: { availableForPrint: true, printSourceImageUrl, printProducts: printProducts as never },
    });
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
