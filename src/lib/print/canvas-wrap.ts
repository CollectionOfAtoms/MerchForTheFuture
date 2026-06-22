/**
 * Pure canvas-wrap constants (US-MFTF-PF.2 / PF.5). Deliberately Prisma-free so client
 * components (the wrap picker) can import them without pulling the server DB client into
 * the browser bundle. `@/lib/print/framing` re-exports these for server callers.
 */
import type { CanvasWrap } from "@/generated/prisma/client";

/**
 * The wraps a seller may pick (US-MFTF-PF.2). `IMAGE_WRAP` is deliberately excluded —
 * the enum still contains it (no migration needed to re-allow), so this list is the
 * single application-layer source of truth for the UI picker AND the server-side guard.
 */
export const SELECTABLE_CANVAS_WRAPS: CanvasWrap[] = ["MIRROR_WRAP", "BLACK", "WHITE"];

/** Default wrap when none is stored (founder-ratified 2026-06-21). */
export const DEFAULT_CANVAS_WRAP: CanvasWrap = "MIRROR_WRAP";

/** Buyer/seller-facing labels for each wrap. */
export const WRAP_LABELS: Record<CanvasWrap, string> = {
  MIRROR_WRAP: "Mirror wrap",
  BLACK: "Black",
  WHITE: "White",
  IMAGE_WRAP: "Image wrap",
};

/** Prodigi `attributes.wrap` API value (PascalCase) for each enum member (US-MFTF-PF.5). */
export const WRAP_API_VALUE: Record<CanvasWrap, string> = {
  MIRROR_WRAP: "MirrorWrap",
  BLACK: "Black",
  WHITE: "White",
  IMAGE_WRAP: "ImageWrap",
};

/** True only for a wrap the seller is allowed to select (excludes IMAGE_WRAP). */
export function isSelectableWrap(value: string): value is CanvasWrap {
  return (SELECTABLE_CANVAS_WRAPS as string[]).includes(value);
}
