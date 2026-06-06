import { describe, it, expect } from "vitest";
import { validateImageResolution, ResolutionWarning } from "@/lib/print/quality";

describe("US-8.6 — Print Quality Assurance", () => {
  it("passes validation for high-res image at target size", () => {
    const result = validateImageResolution({
      widthPx: 4800,
      heightPx: 7200,
      targetWidthIn: 16,
      targetHeightIn: 24,
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(0);
    expect(result.dpi).toBeGreaterThanOrEqual(300);
  });

  it("returns warning when DPI is below 300 for the selected size", () => {
    const result = validateImageResolution({
      widthPx: 1000,
      heightPx: 1500,
      targetWidthIn: 16,
      targetHeightIn: 24,
    });
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/dpi|resolution|300/i);
  });

  it("returns exact calculated DPI", () => {
    const result = validateImageResolution({
      widthPx: 4800,
      heightPx: 7200,
      targetWidthIn: 16,
      targetHeightIn: 24,
    });
    expect(result.dpi).toBe(300);
  });

  it("handles landscape orientation correctly", () => {
    // 24x16 print at 300dpi needs 7200x4800px
    const result = validateImageResolution({
      widthPx: 7200,
      heightPx: 4800,
      targetWidthIn: 24,
      targetHeightIn: 16,
    });
    expect(result.valid).toBe(true);
  });

  it("flags images that are very low resolution", () => {
    const result = validateImageResolution({
      widthPx: 400,
      heightPx: 600,
      targetWidthIn: 16,
      targetHeightIn: 24,
    });
    expect(result.valid).toBe(false);
    expect(result.dpi).toBeLessThan(300);
  });

  it("returns a warning object with suggestion to resize", () => {
    const result = validateImageResolution({
      widthPx: 1000,
      heightPx: 1500,
      targetWidthIn: 16,
      targetHeightIn: 24,
    });
    const warning = result.warnings[0] as string;
    expect(typeof warning).toBe("string");
    expect(warning.length).toBeGreaterThan(10);
  });
});
