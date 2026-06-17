/**
 * Per-kind `CartItem.selection` validators (US-MFTF-11.1).
 *
 * These are *structural* validators: they confirm the JSON `selection` payload
 * has exactly the expected keys and types for its `itemKind`, and reject
 * malformed payloads (missing keys, wrong types, unknown extra keys). Whether the
 * chosen colour/size/SKU is actually *offered* on a given listing is a separate,
 * data-dependent check performed by `addToCartAction` against the normalized
 * read-shape (US-MFTF-11.2/11.3) — it is deliberately not done here so these
 * functions stay pure and DB-free.
 *
 * APPAREL selection: `{ colorId, sizeLabel }`.
 *   `colorId` is the cross-mode *offered-colour identity*, not a `ProductTypeColor`
 *   FK: designed listings expose colours via `ProductTypeColor` while referenced
 *   (Teemill) colours have no such FK, so the cart keys on the normalized colour
 *   identity (the colour name surfaced by `getApparelListingDetail`) which exists
 *   in both modes. The key is named `colorId` to match the US-MFTF-11.1 spec.
 *
 * PRINT selection: `{ prodigiSku, attributes, quotedUnitPrice }`.
 *   `quotedUnitPrice` is a display-only snapshot of the Prodigi quote at add time;
 *   the authoritative price is re-quoted at checkout (MFTF-12).
 */

export interface ApparelSelection {
  colorId: string;
  sizeLabel: string;
}

export interface PrintSelection {
  prodigiSku: string;
  attributes: Record<string, string>;
  quotedUnitPrice: number;
}

export type ValidatorResult<T> = { valid: true; value: T } | { valid: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateApparelSelection(raw: unknown): ValidatorResult<ApparelSelection> {
  if (!isPlainObject(raw)) {
    return { valid: false, error: "Apparel selection must be an object." };
  }
  const keys = Object.keys(raw);
  const allowed = new Set(["colorId", "sizeLabel"]);
  const unknown = keys.filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    return { valid: false, error: `Unexpected selection field(s): ${unknown.join(", ")}.` };
  }
  if (!nonEmptyString(raw.colorId)) {
    return { valid: false, error: "Apparel selection requires a colorId." };
  }
  if (!nonEmptyString(raw.sizeLabel)) {
    return { valid: false, error: "Apparel selection requires a sizeLabel." };
  }
  return { valid: true, value: { colorId: raw.colorId, sizeLabel: raw.sizeLabel } };
}

export function validatePrintSelection(raw: unknown): ValidatorResult<PrintSelection> {
  if (!isPlainObject(raw)) {
    return { valid: false, error: "Print selection must be an object." };
  }
  const keys = Object.keys(raw);
  const allowed = new Set(["prodigiSku", "attributes", "quotedUnitPrice"]);
  const unknown = keys.filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    return { valid: false, error: `Unexpected selection field(s): ${unknown.join(", ")}.` };
  }
  if (!nonEmptyString(raw.prodigiSku)) {
    return { valid: false, error: "Print selection requires a prodigiSku." };
  }
  if (!isPlainObject(raw.attributes)) {
    return { valid: false, error: "Print selection requires an attributes object." };
  }
  if (!Object.values(raw.attributes).every((v) => typeof v === "string")) {
    return { valid: false, error: "Print selection attributes must be string-valued." };
  }
  if (typeof raw.quotedUnitPrice !== "number" || !Number.isFinite(raw.quotedUnitPrice) || raw.quotedUnitPrice < 0) {
    return { valid: false, error: "Print selection requires a non-negative quotedUnitPrice." };
  }
  return {
    valid: true,
    value: {
      prodigiSku: raw.prodigiSku,
      attributes: raw.attributes as Record<string, string>,
      quotedUnitPrice: raw.quotedUnitPrice,
    },
  };
}

/** Validate a `selection` payload for the given kind. */
export function validateSelection(
  itemKind: "APPAREL" | "PRINT",
  raw: unknown,
): ValidatorResult<ApparelSelection | PrintSelection> {
  return itemKind === "APPAREL" ? validateApparelSelection(raw) : validatePrintSelection(raw);
}
