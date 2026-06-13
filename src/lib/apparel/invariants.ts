/**
 * Application-layer invariant for an `ApparelListing`'s sourcing mode.
 *
 * Prisma cannot express these cross-field/cross-relation rules as a DB
 * constraint (consistent with the existing US-MFTF-5.1 single-FK-per-order
 * convention), so they are enforced here and called from the create/update
 * actions:
 *
 *   DESIGNED   ⇒ productTypeId + designImageUrl non-null, zero ReferencedVariant rows
 *   REFERENCED ⇒ providerKey + providerProductRef non-null, zero ApparelListingColor rows
 *   exactly one of { productTypeId, providerProductRef } is set
 */
export interface ApparelListingInvariantInput {
  sourcingMode: "DESIGNED" | "REFERENCED";
  productTypeId: string | null;
  designImageUrl: string | null;
  providerKey: string | null;
  providerProductRef: string | null;
  referencedVariantCount: number;
  apparelListingColorCount: number;
}

export type ApparelListingInvariantResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateApparelListingInvariant(
  input: ApparelListingInvariantInput,
): ApparelListingInvariantResult {
  const {
    sourcingMode,
    productTypeId,
    designImageUrl,
    providerKey,
    providerProductRef,
    referencedVariantCount,
    apparelListingColorCount,
  } = input;

  // Exactly one of the two backing references must be present.
  const hasProductType = Boolean(productTypeId);
  const hasProviderRef = Boolean(providerProductRef);
  if (hasProductType === hasProviderRef) {
    return {
      valid: false,
      error:
        "Exactly one of productTypeId (designed) or providerProductRef (referenced) must be set.",
    };
  }

  if (sourcingMode === "DESIGNED") {
    if (!productTypeId) {
      return { valid: false, error: "Designed listings require a product type." };
    }
    if (!designImageUrl) {
      return { valid: false, error: "Designed listings require a design file." };
    }
    if (referencedVariantCount > 0) {
      return {
        valid: false,
        error: "Designed listings must not have referenced variants.",
      };
    }
    return { valid: true };
  }

  // REFERENCED
  if (!providerKey) {
    return { valid: false, error: "Referenced listings require a provider key." };
  }
  if (!providerProductRef) {
    return {
      valid: false,
      error: "Referenced listings require a provider product ref.",
    };
  }
  if (apparelListingColorCount > 0) {
    return {
      valid: false,
      error: "Referenced listings must not have seller-curated colors.",
    };
  }
  return { valid: true };
}
