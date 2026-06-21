import { prisma } from "@/lib/db";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";

/**
 * The buyer's primary (default) saved address, mapped to the checkout address shape,
 * or null if they have none. Used to pre-populate shipping forms throughout the
 * buying cycle so a returning buyer doesn't re-type a known address.
 */
export async function getDefaultShippingAddress(
  userId: string,
): Promise<FulfillmentShippingAddress | null> {
  const a = await prisma.userAddress.findFirst({ where: { userId, isDefault: true } });
  if (!a) return null;
  return {
    name: a.name,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state ?? "",
    postal: a.postal,
    country: a.country,
  };
}
