# Proposal — Epic: Canvas Print Fidelity (seller-controlled wrap + framing)

> **Status: DRAFT for founder review.** Authored from a Claude Code implementation
> session (2026-06-21) at the founder's request. This document does **not** modify
> the authoritative `spec/project-tracker.json` or `epicOrder` — those are maintained
> via a `tdd-spec-session`. Once approved, fold these stories into the tracker and
> slot the epic into `epicOrder.sequence` in a spec session, then implement TDD on a
> dedicated branch/PR.

## Problem / motivation

When a fine-art print is ordered on **stretched canvas** (`GLOBAL-CAN-*`), two
finishing decisions currently fall back to Prodigi defaults, so the founders can't
guarantee the result:

1. **Edge wrap** — what the physical sides of the canvas show. Live-verified options
   (sandbox, 2026-06-21; see `docs/prodigi-api-notes.md`):
   `attributes.wrap ∈ { Black, ImageWrap, MirrorWrap, White }`.
2. **Framing / cropping** — our source art is not the exact aspect ratio of the canvas,
   so Prodigi (via `sizing: fillPrintArea`) crops it with no human in the loop. The
   founder wants to **see and control** how the art is framed onto each canvas size.

Today both the order and quote paths in `src/lib/fulfillment/providers/prodigi.ts`
hardcode `sizing: "fillPrintArea"` and send **no** `wrap` attribute. The API plumbing
to fix this is small; the **seller-facing configuration model, the crop pipeline, and
the schema** are the real work — hence a standalone epic, not a bug fix.

## Important context: prints have no seller-config surface today

Per `project-description.md` (Cart & Checkout Model): *"Prints remain parameterized
purchases off the artwork listing (dynamic Prodigi catalog filtered by aspect ratio)."*
Buyers pick size/material at purchase time; the seller never "sets up" a print. This
epic **introduces** a per-listing seller print-configuration surface — the central new
concept and the reason this needs design sign-off before code.

## Proposed model (open for founder decisions)

- **Granularity: per aspect ratio, not per individual SKU.** Canvas sizes that share an
  aspect ratio (e.g. 8×10 and 16×20 are both 4:5) can share one framing crop + wrap
  choice. This is fewer decisions for the seller and equivalent output. _(Decision A —
  see below; the founder's wording was "per available canvas size", which we can also
  honour literally if preferred.)_
- **Crop to the exact canvas aspect.** The framing tool produces a crop rectangle on the
  source image at the canvas's exact aspect. We store the cropped image (one per aspect)
  in Blob and send **that** to Prodigi, so the front face has zero guesswork. With an
  exact-aspect asset, `fill` vs `fit` becomes a non-issue for the face; **wrap** still
  governs the sides.
- **Wrap is seller-chosen** per artwork (default `ImageWrap`). _(Decision B: seller-fixed
  vs buyer-selectable.)_
- **Scope: canvas first.** Paper prints (`GLOBAL-FAP-*`) have no wrap; whether the same
  framing-crop tool should also apply to paper (to control face cropping) is Decision C.

### Schema sketch (no final names)

```
model PrintFraming {
  id            String   @id @default(cuid())
  artworkId     String
  aspectRatio   String   // normalized, e.g. "4:5" (or sku if per-SKU chosen)
  wrap          CanvasWrap          // BLACK | IMAGE_WRAP | MIRROR_WRAP | WHITE
  croppedUrl    String              // Blob URL of the exact-aspect crop sent to Prodigi
  cropX  Float  cropY  Float  cropW  Float  cropH  Float   // normalized [0..1] source rect
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([artworkId, aspectRatio])
}
enum CanvasWrap { BLACK  IMAGE_WRAP  MIRROR_WRAP  WHITE }
```

Schema change ⇒ `prisma generate` + `db push` to both DBs + `resetDatabase` TRUNCATE
update + dev-server restart (per AGENTS conventions).

## Proposed stories

- **US-1 — Schema + framing data model.** `PrintFraming` + `CanvasWrap` enum; read/write
  helpers (`getFramingForArtwork`, `upsertFraming`). Pure data-layer TDD.
- **US-2 — Seller wrap selection (artwork edit).** A wrap picker per offered canvas
  aspect on the artwork edit page; valid values sourced from the verified set; defaults
  to `ImageWrap`. Server action persists. (No interactive canvas — testable in jsdom.)
- **US-3 — Interactive framing tool.** A draggable/resizable crop box locked to the
  canvas aspect, overlaid on the source image, bounded to the image; "Confirm framing"
  posts the normalized rect → server crops via the existing Sharp pipeline
  (`src/lib/artworks/variants.ts`) → stores the exact-aspect image in Blob →
  `PrintFraming.croppedUrl`. Hardest UI; split rendering logic from drag math so the math
  is unit-testable; the drag interaction gets a Playwright spec.
- **US-4 — Fan-out sends wrap + cropped asset.** For canvas line items,
  `createProviderOrder` (`src/lib/fulfillment/providers/prodigi.ts`) sends
  `attributes: { wrap }` and the framed `croppedUrl` (falling back to the original +
  default wrap when no framing row exists); `quoteShipping` includes `wrap`. Asserts the
  exact Prodigi order/quote body via MSW.
- **US-5 (optional) — Buyer preview.** Show the framed preview + (if buyer-selectable)
  wrap on the print purchase flow.

## Decisions needed from the founder

| # | Decision | Default if unspecified |
|---|---|---|
| A | Framing granularity: per **aspect ratio** vs per individual canvas **size** | Per aspect ratio |
| B | Wrap: **seller-fixed** vs **buyer-selectable** | Seller-fixed, default `ImageWrap` |
| C | Does the framing-crop tool also apply to **paper** prints (face cropping) or canvas only | Canvas only for v1 |
| D | Which canvas sizes a listing offers: keep **all aspect-matching** vs seller-curated subset | Keep all aspect-matching |
| E | Regeneration: if the seller replaces the source art, invalidate existing crops? | Yes — clear framing rows on art replace |

## epicOrder placement (for the spec session to ratify — not changed here)

Suggest after **MFTF-16** and around the print-related work, but it is independent of the
fulfillment loop. The founder/spec-session decides the final position; this session does
not touch `epicOrder`.

## Already landed (separate, in PR #14)

- Live-verified canvas `wrap`/`sizing`/SKU-existence facts → `docs/prodigi-api-notes.md`.
- `scripts/probe-prodigi-canvas-attributes.ts` (the discovery tool).
- BUG-16 (invalid Prodigi SKU rejected at submit time) — unrelated apparel fix, but it
  exercised the same `GET /products/{sku}` existence check this epic relies on.
