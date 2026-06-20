/**
 * Faithfully simulate ONE Teemill polling result for a shipment. Teemill has no
 * webhook, so in production its status arrives when the daily reconciliation cron
 * (checkAndSyncShipments → GET /orders/{ref}) polls it. This feeds a RAW Teemill
 * status word through the real raw→canonical mapping (mapTeemillStatusToCanonical)
 * and the shared transition seam — exactly what the cron does after a poll, including
 * the buyer lifecycle email. The symmetric counterpart to the Prodigi webhook curls,
 * which is why it takes a raw provider word rather than a canonical status (that's the
 * one extra layer `scripts/advance-shipment.ts` skips).
 *
 * It does NOT call Teemill — it stands in for the HTTP poll, so it works on a seeded
 * demo order (whose fake order ref the real Teemill API wouldn't recognise).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/simulate-teemill-poll.ts <foId> <rawTeemillStatus> [tracking] [carrier]
 *   rawTeemillStatus e.g. processing | printing | dispatched | delivered | cancelled
 */
import { prisma } from "../src/lib/db";
import { mapTeemillStatusToCanonical } from "../src/lib/fulfillment/providers/teemill";
import { applyFulfillmentTransition } from "../src/lib/fulfillment/status";

const [foId, raw, tracking, carrier] = process.argv.slice(2);
if (!foId || !raw) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/simulate-teemill-poll.ts <foId> <rawTeemillStatus> [tracking] [carrier]");
  console.error("  rawTeemillStatus e.g. processing | printing | dispatched | delivered | cancelled");
  process.exit(1);
}

async function main() {
  const before = await prisma.fulfillmentOrder.findUnique({ where: { id: foId }, select: { status: true, provider: true } });
  if (!before) {
    console.error(`No FulfillmentOrder "${foId}".`);
    process.exit(1);
  }

  // The exact mapping the Teemill provider applies on a real poll.
  const canonical = mapTeemillStatusToCanonical(raw);
  if (!canonical) {
    console.log(`raw "${raw}" → (unknown) — logged as a parse warning, NO transition (matches production fail-safe).`);
    process.exit(0);
  }

  const res = await applyFulfillmentTransition(foId, canonical, { trackingNumber: tracking ?? null, carrier: carrier ?? null });
  const after = await prisma.fulfillmentOrder.findUnique({ where: { id: foId }, select: { status: true } });
  console.log(`poll raw "${raw}" → canonical ${canonical};  ${before.status} → ${after?.status}  (transitioned: ${res.transitioned})`);
  if (res.transitioned && ["PRINTING", "SHIPPED", "DELIVERED"].includes(after!.status)) {
    console.log("→ buyer lifecycle email sent for this shipment");
  } else if (!res.transitioned) {
    console.log("→ no-op (monotonic guard: not ahead of the current status, or order is terminal)");
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
