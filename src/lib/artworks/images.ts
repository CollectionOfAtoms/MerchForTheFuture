import { prisma } from "@/lib/db";

const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "image/webp"];

export function validateImageFormat(mimeType: string): boolean {
  return ACCEPTED_FORMATS.includes(mimeType);
}

interface AddImageInput {
  artworkId: string;
  url: string;
  isPrimary: boolean;
  order: number;
}

export async function addImageToArtwork(input: AddImageInput) {
  const { artworkId, url, isPrimary, order } = input;
  if (!url?.trim()) throw new Error("Image URL is required.");

  return prisma.artworkImage.create({
    data: { artworkId, url, isPrimary, order },
  });
}

export async function getImagesForArtwork(artworkId: string) {
  return prisma.artworkImage.findMany({
    where: { artworkId },
    orderBy: { order: "asc" },
  });
}

export async function deleteImageFromArtwork(imageId: string, artworkId: string) {
  const image = await prisma.artworkImage.findUnique({ where: { id: imageId } });
  if (!image || image.artworkId !== artworkId) throw new Error("Image not found.");

  await prisma.artworkImage.delete({ where: { id: imageId } });

  // If the deleted image was primary, promote the next image
  if (image.isPrimary) {
    const next = await prisma.artworkImage.findFirst({
      where: { artworkId },
      orderBy: { order: "asc" },
    });
    if (next) {
      await prisma.artworkImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }
}

export async function setPrimaryImage(imageId: string, artworkId: string) {
  const image = await prisma.artworkImage.findUnique({ where: { id: imageId } });
  if (!image || image.artworkId !== artworkId) throw new Error("Image not found.");

  await prisma.artworkImage.updateMany({ where: { artworkId }, data: { isPrimary: false } });
  await prisma.artworkImage.update({ where: { id: imageId }, data: { isPrimary: true } });
}
