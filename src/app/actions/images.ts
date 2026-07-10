"use server";

import { del } from "@vercel/blob";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addImageToArtwork,
  deleteImageFromArtwork,
  getImagesForArtwork,
  setPrimaryImage,
} from "@/lib/artworks/images";
import { generateVariants } from "@/lib/artworks/variants";
import { prisma } from "@/lib/db";
import { getManagerActor, canManageListing } from "@/lib/seller/authz";

type ActionResult = { error: string } | { success: true; imageId?: string };

async function requireSellerOwnsListing(listingId: string): Promise<string> {
  const actor = await getManagerActor();
  if (!actor) redirect("/sign-in");

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    select: { artwork: { select: { id: true, sellerId: true } } },
  });
  // Owner seller or any admin may manage the listing's images.
  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) redirect("/seller/listings");
  return listing.artwork.id;
}

export async function saveImageAction(listingId: string, url: string): Promise<ActionResult> {
  const artworkId = await requireSellerOwnsListing(listingId);

  const existing = await getImagesForArtwork(artworkId);
  const image = await addImageToArtwork({
    artworkId,
    url,
    isPrimary: existing.length === 0,
    order: existing.length,
  });

  revalidatePath(`/seller/listings/${listingId}/edit`);
  return { success: true as const, imageId: image.id };
}

export async function deleteImageAction(listingId: string, imageId: string): Promise<ActionResult> {
  const artworkId = await requireSellerOwnsListing(listingId);

  const image = await prisma.artworkImage.findUnique({ where: { id: imageId } });
  if (!image || image.artworkId !== artworkId) return { error: "Image not found." };

  const total = await prisma.artworkImage.count({ where: { artworkId } });
  if (total <= 1) return { error: "Cannot delete the last image from a listing." };

  const token = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
  await del(image.url, { token });
  await deleteImageFromArtwork(imageId, artworkId);

  revalidatePath(`/seller/listings/${listingId}/edit`);
  return { success: true as const };
}

export async function setPrimaryImageAction(listingId: string, imageId: string): Promise<ActionResult> {
  const artworkId = await requireSellerOwnsListing(listingId);
  await setPrimaryImage(imageId, artworkId);
  revalidatePath(`/seller/listings/${listingId}/edit`);
  return { success: true as const };
}

export async function regenerateVariantsAction(
  listingId: string,
  imageId: string,
): Promise<ActionResult> {
  // Use a direct ownership check — does not redirect, returns { error } on all
  // failures, and works regardless of listing status (PUBLISHED, SOLD, etc.).
  const actor = await getManagerActor();
  if (!actor) return { error: "Not authorised." };

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    select: { artwork: { select: { id: true, sellerId: true } } },
  });
  if (!listing || !canManageListing(actor, listing.artwork.sellerId)) return { error: "Listing not found." };

  const image = await prisma.artworkImage.findUnique({ where: { id: imageId } });
  if (!image || image.artworkId !== listing.artwork.id) return { error: "Image not found." };

  const result = await generateVariants(imageId);
  if (!result) return { error: "Variant regeneration failed." };

  revalidatePath(`/seller/listings/${listingId}/edit`);
  return { success: true as const };
}
