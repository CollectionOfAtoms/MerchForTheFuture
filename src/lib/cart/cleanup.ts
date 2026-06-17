/**
 * Guest-cart cleanup (US-MFTF-11.6). Deletes guest carts (rows with a
 * `guestToken`) whose `updatedAt` is older than 30 days, cascading their items.
 * User carts (`userId` set, `guestToken` null) are never matched. A single bulk
 * `deleteMany` — no per-row loop — so it stays within the 10s serverless limit.
 */
import { prisma } from "@/lib/db";

export const GUEST_CART_TTL_DAYS = 30;
const TTL_MS = GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000;

export async function cleanupStaleGuestCarts(now: Date = new Date()): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - TTL_MS);
  const result = await prisma.cart.deleteMany({
    where: { guestToken: { not: null }, updatedAt: { lt: cutoff } },
  });
  return { deleted: result.count };
}
