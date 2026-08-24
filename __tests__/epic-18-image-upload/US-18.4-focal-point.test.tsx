// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ListingCard from "@/components/ListingCard";
import { focalToObjectPosition } from "@/lib/artworks/focal";
import type { ArtworkCard } from "@/lib/artworks/browse";

afterEach(cleanup);

/**
 * US-18.4 — Seller-Specified Focal Point for the Browse-Grid Crop.
 * The browse/prints grid tile is a fixed square (object-cover); the seller's
 * chosen focal point becomes the CSS object-position so the crop keeps the
 * important part of the piece in view. Absent/legacy → centre ("50% 50%").
 */
describe("focalToObjectPosition", () => {
  it("defaults to centre for null/undefined", () => {
    expect(focalToObjectPosition(null, null)).toBe("50% 50%");
    expect(focalToObjectPosition(undefined, undefined)).toBe("50% 50%");
  });

  it("maps a normalized point to percentages", () => {
    expect(focalToObjectPosition(0.5, 0.5)).toBe("50% 50%");
    expect(focalToObjectPosition(0, 0)).toBe("0% 0%");
    expect(focalToObjectPosition(1, 1)).toBe("100% 100%");
    expect(focalToObjectPosition(0.25, 0.75)).toBe("25% 75%");
  });

  it("clamps out-of-range values into [0,1]", () => {
    expect(focalToObjectPosition(-0.2, 1.5)).toBe("0% 100%");
  });
});

const baseCard: ArtworkCard = {
  id: "art-1",
  title: "Coral Bloom",
  medium: null,
  year: null,
  sellerId: "seller-1",
  artist: "J. Caldwell",
  primaryImageUrl: "https://blob.example/coral.jpg",
  focalX: 0.5,
  focalY: 0.5,
  hasOriginal: true,
  hasPrint: false,
  originalStatus: "ACTIVE",
  saleType: "FIXED_PRICE",
  price: 450,
  currency: "USD",
  publishedAt: new Date("2026-01-01"),
};

describe("ListingCard focal-point crop", () => {
  it("applies the seller's focal point as object-position on the tile image", () => {
    render(<ListingCard card={{ ...baseCard, focalX: 0.5, focalY: 0 }} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.style.objectPosition).toBe("50% 0%");
  });

  it("centres the crop when no focal point is set (legacy listings)", () => {
    render(<ListingCard card={{ ...baseCard, focalX: undefined, focalY: undefined }} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.style.objectPosition).toBe("50% 50%");
  });
});
