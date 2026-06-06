import { fulfillPayment } from "../src/lib/payments/webhook";

const id = process.argv[2];
if (!id) { console.error("Usage: npx tsx scripts/fulfill.ts <paymentIntentId>"); process.exit(1); }

fulfillPayment(id)
  .then(() => { console.log("Done — order marked PAID"); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
