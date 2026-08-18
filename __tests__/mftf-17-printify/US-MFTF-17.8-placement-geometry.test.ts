import { describe, it, expect } from "vitest";
import {
  defaultPlacement,
  initialPlacement,
  movePlacement,
  scalePlacement,
  rotatePlacement,
  clampPlacement,
  MIN_SCALE,
  MAX_SCALE,
} from "@/lib/apparel/placement-geometry";

// US-MFTF-17.8 — pure placement geometry, mirroring crop-geometry: normalized to
// exactly Printify's positioned print_areas shape ({x,y,scale,angle}). x/y are the
// design's centre as a fraction (0..1) of the print area; scale is the design width
// as a fraction of the print-area width, clamped to a provisional safety range;
// angle is degrees, normalized to (-180,180]. DOM-free.

describe("US-MFTF-17.8 — placement geometry", () => {
  it("defaults to Printify's centred placement (the scale-1 auto-centre meaning)", () => {
    expect(defaultPlacement()).toEqual({ x: 0.5, y: 0.5, scale: 1, angle: 0 });
  });

  it("the tool's starting placement is centred but a friendlier 60% width", () => {
    expect(initialPlacement()).toEqual({ x: 0.5, y: 0.5, scale: 0.6, angle: 0 });
  });

  it("moves the centre by a normalized delta, clamped to [0,1]", () => {
    expect(movePlacement(defaultPlacement(), 0.1, -0.2)).toEqual({
      x: 0.6,
      y: 0.3,
      scale: 1,
      angle: 0,
    });
    // Clamps past the edges — the centre never leaves the print area.
    expect(movePlacement(defaultPlacement(), 1, 1)).toMatchObject({ x: 1, y: 1 });
    expect(movePlacement(defaultPlacement(), -1, -1)).toMatchObject({ x: 0, y: 0 });
  });

  it("scales by a delta, clamped to [MIN_SCALE, MAX_SCALE]", () => {
    expect(scalePlacement(defaultPlacement(), 0.5).scale).toBeCloseTo(1.5);
    expect(scalePlacement(defaultPlacement(), 100).scale).toBe(MAX_SCALE);
    expect(scalePlacement(defaultPlacement(), -100).scale).toBe(MIN_SCALE);
  });

  it("rotates by a delta in degrees, wrapping to (-180,180]", () => {
    expect(rotatePlacement(defaultPlacement(), 30).angle).toBe(30);
    expect(rotatePlacement({ x: 0.5, y: 0.5, scale: 1, angle: 170 }, 20).angle).toBe(-170);
    expect(rotatePlacement({ x: 0.5, y: 0.5, scale: 1, angle: -170 }, -20).angle).toBe(170);
  });

  it("clampPlacement normalizes an out-of-range placement into valid ranges", () => {
    expect(clampPlacement({ x: 2, y: -1, scale: 99, angle: 540 })).toEqual({
      x: 1,
      y: 0,
      scale: MAX_SCALE,
      angle: 180,
    });
    // Non-finite values collapse to safe defaults rather than propagating NaN.
    expect(clampPlacement({ x: NaN, y: 0.5, scale: Infinity, angle: NaN })).toEqual({
      x: 0,
      y: 0.5,
      scale: MAX_SCALE,
      angle: 0,
    });
  });

  it("move/scale/rotate round-trip back to the starting placement", () => {
    const start = { x: 0.4, y: 0.7, scale: 1.2, angle: 20 };
    const moved = movePlacement(start, 0.1, -0.1);
    expect(movePlacement(moved, -0.1, 0.1)).toMatchObject({ x: 0.4, y: 0.7 });
    expect(scalePlacement(scalePlacement(start, 0.3), -0.3).scale).toBeCloseTo(1.2);
    expect(rotatePlacement(rotatePlacement(start, 40), -40).angle).toBeCloseTo(20);
  });
});
