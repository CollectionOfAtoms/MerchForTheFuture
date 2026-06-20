/**
 * Drive one FulfillmentOrder through a status transition locally — exactly as a
 * provider callback or the daily polling cron would, via the shared seam
 * `applyFulfillmentTransition` (US-MFTF-14.2). Fires the buyer lifecycle email as a
 * side effect (PRINTING / SHIPPED / DELIVERED).
 *
 * This is the way to drive the **Teemill** side of a mixed order: Teemill has no
 * webhook to POST to, so its status normally arrives via the polling cron — this
 * calls the same transition contract directly.
 *
 * Usage (dev server not required — this writes the DB + sends email directly):
 *   npx tsx --env-file=.env.local scripts/advance-shipment.ts <fulfillmentOrderId> <STATUS> [tracking] [carrier]
 *   STATUS ∈ PROCESSING | PRINTING | SHIPPED | DELIVERED | CANCELLED | ERROR
 */
import { prisma } from "../src/lib/db";
import { applyFulfillmentTransition } from "../src/lib/fulfillment/status";
import type { FulfillmentStatus } from "../src/lib/fulfillment/types";

const VALID = ["PROCESSING", "PRINTING", "SHIPPED", "DELIVERED", "CANCELLED", "ERROR"];
const [id, status, tracking, carrier] = process.argv.slice(2);

if (!id || !status || !VALID.includes(status)) {
  console.error(`Usage: npx tsx --env-file=.env.local scripts/advance-shipment.ts <fulfillmentOrderId> <${VALID.join("|")}> [tracking] [carrier]`);
  process.exit(1);
}

async function main() {
  const before = await prisma.fulfillmentOrder.findUnique({ where: { id }, select: { status: true, provider: true } });
  if (!before) {
    console.error(`No FulfillmentOrder "${id}".`);
    process.exit(1);
  }
  const res = await applyFulfillmentTransition(id, status as FulfillmentStatus, {
    trackingNumber: tracking ?? null,
    carrier: carrier ?? null,
  });
  const after = await prisma.fulfillmentOrder.findUnique({ where: { id }, select: { status: true } });
  console.log(`provider=${before.provider}  ${before.status} → ${after?.status}  (transitioned: ${res.transitioned})`);
  if (res.transitioned && ["PRINTING", "SHIPPED", "DELIVERED"].includes(after!.status)) {
    console.log("→ buyer lifecycle email sent for this shipment");
  } else if (!res.transitioned) {
    console.log("→ no-op (monotonic guard: target is not ahead of the current status, or the order is terminal)");
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
