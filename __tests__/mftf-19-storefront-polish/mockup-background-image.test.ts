import { describe, it, expect } from "vitest";
import {
  isBackgroundImage,
  mockupBackgroundStyle,
  DEFAULT_MOCKUP_BACKGROUND,
} from "@/lib/apparel/mockup-background";

// US-MFTF-19.7 (image-background extension) — a stored mockup background is an
// opaque string that is either a CSS colour (the original swatches) or an image
// reference (a design published by scripts/process-backgrounds.ts). These pure
// helpers decide which and produce the composite style used at every render site.

describe("isBackgroundImage", () => {
  it("is true for URLs, absolute paths, and data URIs", () => {
    expect(isBackgroundImage("https://blob.vercel-storage.com/backgrounds/img-3938-full.webp")).toBe(true);
    expect(isBackgroundImage("http://example.com/bg.png")).toBe(true);
    expect(isBackgroundImage("/backgrounds/sunburst.webp")).toBe(true);
    expect(isBackgroundImage("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isBackgroundImage("  https://x/y.webp  ")).toBe(true); // trims first
  });

  it("is false for colours and empty values", () => {
    expect(isBackgroundImage("#ffffff")).toBe(false);
    expect(isBackgroundImage("#000")).toBe(false);
    expect(isBackgroundImage("rebeccapurple")).toBe(false);
    expect(isBackgroundImage("")).toBe(false);
    expect(isBackgroundImage(null)).toBe(false);
    expect(isBackgroundImage(undefined)).toBe(false);
  });
});

describe("mockupBackgroundStyle", () => {
  it("returns an empty style for no value", () => {
    expect(mockupBackgroundStyle(null)).toEqual({});
    expect(mockupBackgroundStyle(undefined)).toEqual({});
    expect(mockupBackgroundStyle("")).toEqual({});
  });

  it("composites a colour as a solid background-color", () => {
    expect(mockupBackgroundStyle("#000000")).toEqual({ backgroundColor: "#000000" });
    expect(mockupBackgroundStyle(DEFAULT_MOCKUP_BACKGROUND)).toEqual({ backgroundColor: "#ffffff" });
    expect(mockupBackgroundStyle("rebeccapurple")).toEqual({ backgroundColor: "rebeccapurple" });
  });

  it("composites an image reference as a cover background-image", () => {
    const url = "https://blob.vercel-storage.com/backgrounds/img-3942-full.webp";
    expect(mockupBackgroundStyle(url)).toEqual({
      backgroundImage: `url("${url}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    });
  });
});
