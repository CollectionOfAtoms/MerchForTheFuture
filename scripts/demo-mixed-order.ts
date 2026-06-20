/**
 * Local end-to-end demo of the MFTF-14 fulfillment loop on a MIXED cart: ONE PAID
 * order that splits into TWO shipments — a Teemill apparel shipment (polling path)
 * and a Prodigi print shipment (webhook path) — seeded under an existing buyer
 * account with sample product images so the lifecycle emails render thumbnails.
 *
 * It prints the buyer order URL and the exact commands to drive EACH shipment
 * through PRINTING → SHIPPED → DELIVERED, illustrating that both detection paths
 * feed one transition contract and that the order rollup stays "Processing" until
 * both shipments ship. No Stripe and no real Prodigi/Teemill calls — the shipments
 * are written as already-placed.
 *
 * Usage (dev server running — see `npm run dev`):
 *   npx tsx --env-file=.env.local scripts/demo-mixed-order.ts <your-buyer-email>
 */
import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { prisma } from "../src/lib/db";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/demo-mixed-order.ts <your-buyer-email>");
  process.exit(1);
}

const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://localhost:3000";
const BLOB_TOKEN = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Fetch a placeholder image and rehost it on OUR Vercel Blob store, returning the
 * blob URL. The public browse/shop/seller pages render catalog images through
 * `next/image`, whose remotePatterns only allow our blob host — seeding an external
 * URL (e.g. picsum.photos) directly would crash those pages with
 * "hostname not configured". Rehosting keeps the demo self-contained and safe.
 */
async function placeholder(seed: string, w: number, h: number): Promise<string> {
  const res = await fetch(`https://picsum.photos/seed/${seed}/${w}/${h}`);
  if (!res.ok) throw new Error(`placeholder fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const blob = await put(`demo/${seed}-${w}x${h}-${Date.now()}.jpg`, buffer, {
    access: "public",
    contentType: res.headers.get("content-type") ?? "image/jpeg",
    token: BLOB_TOKEN,
  });
  return blob.url;
}
const prodigiToken = `demo-${crypto.randomBytes(6).toString("hex")}`;
const prodigiOrderId = `demo-prodigi-${crypto.randomBytes(3).toString("hex")}`;

async function main() {
  const buyer = await prisma.user.findUnique({ where: { email } });
  if (!buyer) {
    console.error(`No user with email "${email}". Sign up in the app first, then re-run.`);
    process.exit(1);
  }
  const seller = (await prisma.user.findFirst({ where: { roles: { has: "SELLER" } } })) ?? buyer;

  // Rehost the sample images onto our own blob store first (see placeholder()).
  const [teeOriginal, teeGrid, printDisplay, printGrid, printSource] = await Promise.all([
    placeholder("mftf-tee", 600, 600),
    placeholder("mftf-tee", 240, 240),
    placeholder("mftf-print", 600, 600),
    placeholder("mftf-print", 240, 240),
    placeholder("mftf-print", 1200, 1200),
  ]);

  // ── Shipment A: Teemill referenced apparel (polling path) ──
  // Sample lifestyle photo is OUR (blob-hosted) image; the provider mockup is set too
  // but is deliberately never used in buyer emails (buyer-opacity).
  const tee = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id, sourcingMode: "REFERENCED", title: "Powered By Plants Tee", retailPrice: 32, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: "demo",
      images: { create: [{ originalUrl: teeOriginal, gridUrl: teeGrid, isPrimary: true, sortOrder: 0 }] },
      referencedVariants: { create: [{ variantRef: "vr-demo", colorName: "Evergreen", colorHex: "#264d3b", sizeLabel: "M", stockLevel: 9, isOrderable: true, mockupUrl: "https://images.teemill.com/demo.png" }] },
    },
  });

  // ── Shipment B: Prodigi fine-art print (webhook path) ──
  const artwork = await prisma.artwork.create({
    data: {
      sellerId: seller.id, title: "Sunrise Over Hope Valley", description: "demo", status: "PUBLISHED",
      images: { create: [{ url: printDisplay, gridUrl: printGrid, isPrimary: true, order: 0 }] },
    },
  });
  const print = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 120, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: printSource },
  });

  // ── One buyer order, one payment, split into two shipments ──
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 72, totalAmount: 80,
      shippingName: "Demo Buyer", shippingLine1: "1 Demo St", shippingCity: "Portland", shippingState: "OR", shippingPostal: "97201", shippingCountry: "US",
    },
  });
  // Created first → "Shipment 1 of 2" (getOrderShipmentsView orders by createdAt asc).
  const teemillFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "teemill", status: "CONFIRMED", providerOrderId: "demo-teemill-1", shippingCost: 0 } });
  const prodigiFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "CONFIRMED", providerOrderId: prodigiOrderId, webhookToken: prodigiToken, shippingCost: 4.99 } });

  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: tee.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: teemillFo.id } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1, unitPrice: 40, fulfillmentOrderId: prodigiFo.id } });

  const curl = (type: string, extra = "") =>
    `curl -k -X POST '${base}/api/webhooks/prodigi?token=${prodigiToken}' -H 'content-type: application/json' -d '{"type":"${type}","data":{"order":{"id":"${prodigiOrderId}"${extra}}}}'`;
  // Teemill has no webhook — simulate a poll by feeding a RAW Teemill status word
  // through the real raw→canonical mapping (what the daily cron does after GET /orders).
  const poll = (rawStatus: string, args = "") =>
    `npx tsx --env-file=.env.local scripts/simulate-teemill-poll.ts ${teemillFo.id} ${rawStatus}${args}`;

  console.log(`\n✅ Seeded a 2-shipment order under ${email}`);
  console.log(`   Buyer order page: ${base}/buyer/orders/${order.id}   (log in as ${email})`);
  console.log(`   Shipment 1 of 2 → apparel  [Teemill / polling]   FulfillmentOrder ${teemillFo.id}`);
  console.log(`   Shipment 2 of 2 → print    [Prodigi / webhook]   FulfillmentOrder ${prodigiFo.id}`);
  console.log(`   NOTE: the two shipments are SEPARATE orders — drive each with its own commands below.`);
  console.log(`         DELIVERED is the end of the line (monotonic guard); re-run this script for a fresh order to replay.\n`);

  console.log("── Drive Shipment 2 (Prodigi, webhook path) — fire these one at a time, refreshing the page between ──\n");
  console.log("# → PRINTING\n" + curl("com.prodigi.order.status.details.printStatus#Printing") + "\n");
  console.log("# → SHIPPED (with tracking)\n" + curl("com.prodigi.order.shipments.shipment#Dispatched", `,"shipments":[{"tracking":{"number":"PG-TRACK-9","carrier":"FedEx"}}]`) + "\n");
  console.log("# → DELIVERED\n" + curl("com.prodigi.order.shipments.shipment#Delivered") + "\n");

  console.log("── Drive Shipment 1 (Teemill, polling path — no webhook; this simulates the daily cron polling Teemill) ──\n");
  console.log("# → PRINTING   (raw Teemill status \"printing\")\n" + poll("printing") + "\n");
  console.log("# → SHIPPED    (raw \"dispatched\" + tracking)\n" + poll("dispatched", ` TM-TRACK-77 "Royal Mail"`) + "\n");
  console.log("# → DELIVERED  (raw \"delivered\")\n" + poll("delivered") + "\n");

  console.log("Notes:");
  console.log("  • Each shipment emits its OWN emails labelled \"Shipment 1 of 2\" / \"Shipment 2 of 2\", with that shipment's items + thumbnails.");
  console.log("  • The order-page rollup stays \"Processing\" until BOTH shipments reach SHIPPED/DELIVERED, then flips to \"Shipped\".");
  console.log("  • Drive them out of step (e.g. ship #2 fully while #1 is still PRINTING) to see the independent states.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
