"use client";

import Carousel, { type CarouselImage } from "@/components/Carousel";
import type { ReferencedCarouselImage } from "@/lib/apparel/referenced";
import { resolveMockupBackground, type MockupBackgrounds } from "@/lib/apparel/mockup-background";

/**
 * Seller edit-page preview carousel. A thin adapter over the shared Carousel
 * (src/components/Carousel.tsx): it maps the referenced read-shape to the shared
 * image shape — resolving each mockup's US-MFTF-19.7 background and adding a
 * "Teemill mockup · colour" / "Lifestyle photo" caption — and delegates all the
 * cycling/letterbox/keyboard behaviour to the shared component.
 */
export default function ReferencedImageCarousel({
  images,
  title,
  backgrounds,
}: {
  images: ReferencedCarouselImage[];
  title: string;
  backgrounds?: MockupBackgrounds | null;
}) {
  const items: CarouselImage[] = images.map((img) => ({
    url: img.url,
    backgroundColor: img.kind === "mockup" ? resolveMockupBackground(backgrounds, img.label) : null,
    badge: img.kind === "mockup" ? `Teemill mockup${img.label ? ` · ${img.label}` : ""}` : "Lifestyle photo",
  }));

  return <Carousel images={items} title={title} emptyLabel="No images yet" />;
}
