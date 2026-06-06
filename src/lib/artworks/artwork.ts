import { prisma } from "@/lib/db";
import type { ArtworkStatus } from "@/generated/prisma/client";

interface CreateArtworkInput {
  sellerId: string;
  title: string;
  description: string;
  medium?: string;
  dimensions?: string;
  year?: number;
}

interface UpdateArtworkInput {
  title?: string;
  description?: string;
  medium?: string;
  dimensions?: string;
  year?: number;
}

const artworkSelect = {
  id: true,
  sellerId: true,
  title: true,
  description: true,
  medium: true,
  dimensions: true,
  year: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createArtwork(input: CreateArtworkInput) {
  const { sellerId, title, description, medium, dimensions, year } = input;

  if (!title?.trim()) throw new Error("Title is required.");
  if (!description?.trim()) throw new Error("Description is required.");

  return prisma.artwork.create({
    data: { sellerId, title, description, medium, dimensions, year },
    select: artworkSelect,
  });
}

export async function getArtworkById(id: string) {
  return prisma.artwork.findUnique({ where: { id }, select: artworkSelect });
}

export async function publishArtwork(artworkId: string, requesterId: string) {
  const artwork = await prisma.artwork.findUnique({ where: { id: artworkId } });
  if (!artwork) throw new Error("Artwork not found.");
  if (artwork.sellerId !== requesterId) throw new Error("Not authorized to publish this artwork.");

  return prisma.artwork.update({
    where: { id: artworkId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
    select: artworkSelect,
  });
}

export async function unpublishArtwork(artworkId: string, requesterId: string) {
  const artwork = await prisma.artwork.findUnique({ where: { id: artworkId } });
  if (!artwork) throw new Error("Artwork not found.");
  if (artwork.sellerId !== requesterId) throw new Error("Not authorized to unpublish this artwork.");

  return prisma.artwork.update({
    where: { id: artworkId },
    data: { status: "DRAFT" },
    select: artworkSelect,
  });
}

export async function updateArtwork(
  artworkId: string,
  requesterId: string,
  input: UpdateArtworkInput
) {
  const artwork = await prisma.artwork.findUnique({ where: { id: artworkId } });
  if (!artwork) throw new Error("Artwork not found.");
  if (artwork.sellerId !== requesterId) throw new Error("Not authorized to edit this artwork.");

  return prisma.artwork.update({
    where: { id: artworkId },
    data: input,
    select: artworkSelect,
  });
}

export async function deleteArtwork(artworkId: string, requesterId: string) {
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: { originalListing: true },
  });
  if (!artwork) throw new Error("Artwork not found.");
  if (artwork.sellerId !== requesterId) throw new Error("Not authorized to delete this artwork.");

  // If the original listing has a completed sale, archive instead of delete
  if (artwork.originalListing?.status === "SOLD") {
    await prisma.artwork.update({
      where: { id: artworkId },
      data: { status: "ARCHIVED" },
    });
    return;
  }

  await prisma.artwork.delete({ where: { id: artworkId } });
}
