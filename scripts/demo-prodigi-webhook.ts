/**
 * Local demo for the MFTF-14 Prodigi webhook → status → email path, testable
 * "to the degree you are able" without Stripe or a real Prodigi order.
 *
 * It seeds a PAID cart order with ONE already-placed Prodigi shipment (status
 * CONFIRMED, a fake providerOrderId, and a known webhookToken) under an existing
 * buyer account, then prints the buyer order URL and three ready-to-run curls that
 * fire simulated Prodigi status callbacks (PRINTING → SHIPPED → DELIVERED). No
 * real Prodigi call is made — the shipment is written directly as already-placed.
 *
 * Usage (dev server must be running — see `npm run dev`):
 *   npx tsx --env-file=.env.local scripts/demo-prodigi-webhook.ts <your-buyer-email>
 */
import { prisma } from "../src/lib/db";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/demo-prodigi-webhook.ts <your-buyer-email>");
  process.exit(1);
}

const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://localhost:3000";
const token = `demo-${Math.random().toString(36).slice(2, 12)}`;
const providerOrderId = `demo-ord-${Math.random().toString(36).slice(2, 8)}`;

async function main() {
  const buyer = await prisma.user.findUnique({ where: { email } });
  if (!buyer) {
    console.error(`No user with email "${email}". Sign up in the app first, then re-run.`);
    process.exit(1);
  }
  const seller = (await prisma.user.findFirst({ where: { roles: { has: "SELLER" } } })) ?? buyer;

  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id, sourcingMode: "REFERENCED", title: "Demo Tee (webhook test)",
      retailPrice: 32, status: "ACTIVE", providerKey: "teemill", providerProductRef: "demo",
    },
  });
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, totalAmount: 36,
      shippingName: "Demo Buyer", shippingLine1: "1 Demo St", shippingCity: "NYC",
      shippingPostal: "10001", shippingCountry: "US",
    },
  });
  const fo = await prisma.fulfillmentOrder.create({
    data: { orderId: order.id, provider: "prodigi", status: "CONFIRMED", providerOrderId, webhookToken: token, shippingCost: 0 },
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id,
      selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: fo.id,
    },
  });

  const steps: Array<[string, string, string]> = [
    ["PRINTING  (\"being printed\" email)", "com.prodigi.order.status.details.printStatus#Printing", ""],
    ["SHIPPED   (tracking email)", "com.prodigi.order.shipments.shipment#Dispatched", `,"shipments":[{"tracking":{"number":"DEMO-123","carrier":"FedEx"}}]`],
    ["DELIVERED (\"delivered\" email)", "com.prodigi.order.shipments.shipment#Delivered", ""],
  ];

  console.log("\n✅ Seeded a demo Prodigi shipment under", email);
  console.log("   Buyer order page:", `${base}/buyer/orders/${order.id}`);
  console.log("   (log in as", email, "to see the badge change)\n");
  console.log("Run these ONE AT A TIME, refreshing the order page between each:\n");
  for (const [label, type, extra] of steps) {
    const body = `{"type":"${type}","data":{"order":{"id":"${providerOrderId}"${extra}}}}`;
    console.log(`# → ${label}`);
    console.log(`curl -k -X POST '${base}/api/webhooks/prodigi?token=${token}' -H 'content-type: application/json' -d '${body}'\n`);
  }
  console.log("Bonus checks:");
  console.log(`  bad token → 401:  curl -k -o /dev/null -w '%{http_code}\\n' -X POST '${base}/api/webhooks/prodigi?token=nope' -H 'content-type: application/json' -d '{}'`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
