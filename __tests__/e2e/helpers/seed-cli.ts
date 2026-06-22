/**
 * E2E seeding CLI, run as a `tsx` subprocess by helpers/db.ts. It lives outside the
 * Playwright runner because the generated Prisma client is CommonJS and Playwright's
 * ESM transform can't load it — `tsx` handles the interop (same as scripts/*.ts).
 * Each command prints exactly one `RESULT:<json>` line that the wrapper parses.
 *
 * Status is advanced with a direct row update (not the transition seam) so UI tests
 * don't fire real MailerSend emails — the transition logic is covered by vitest.
 *
 *   tsx --env-file=.env.local seed-cli.ts ensure-buyer
 *   tsx --env-file=.env.local seed-cli.ts seed-order <buyerId>
 *   tsx --env-file=.env.local seed-cli.ts set-status <foId> <STATUS> [tracking] [carrier]
 *   tsx --env-file=.env.local seed-cli.ts cleanup <orderId> <listingId> <artworkId>
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../src/generated/prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL ?? "" }) });

/**
 * A deterministic, self-contained 4:5 source image as a data URL — no external network
 * or TLS. The browser <img> loads it instantly (so the crop box mounts without a race)
 * and the server-side crop in confirmFramingAction fetches it natively (`fetch` handles
 * `data:`), unlike a mkcert-HTTPS same-origin URL which Node's fetch would reject.
 */
async function framingSourceDataUrl(): Promise<string> {
  const buf = await sharp({
    create: { width: 400, height: 500, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
const E2E_BUYER = { email: "e2e-buyer@mftf.test", password: "E2eBuyer123!" };
const E2E_SELLER = { email: "e2e-seller@mftf.test", password: "E2eSeller123!" };

function emit(o: unknown) {
  console.log("RESULT:" + JSON.stringify(o));
}

async function ensureBuyer() {
  const passwordHash = await bcrypt.hash(E2E_BUYER.password, 12);
  const u = await prisma.user.upsert({
    where: { email: E2E_BUYER.email },
    update: { passwordHash, emailVerified: new Date(), roles: ["BUYER"] },
    create: { email: E2E_BUYER.email, name: "E2E Buyer", passwordHash, emailVerified: new Date(), roles: ["BUYER"] },
  });
  emit({ id: u.id });
}

async function seedOrder(buyerId: string) {
  const seller = (await prisma.user.findFirst({ where: { roles: { has: "SELLER" } } })) ?? { id: buyerId };
  const tee = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id, sourcingMode: "REFERENCED", title: "E2E Powered By Plants Tee", retailPrice: 32, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: "e2e",
      images: { create: [{ originalUrl: "https://picsum.photos/seed/e2e-tee/600", gridUrl: "https://picsum.photos/seed/e2e-tee/240", isPrimary: true, sortOrder: 0 }] },
      referencedVariants: { create: [{ variantRef: "vr", colorName: "Evergreen", colorHex: "#264d3b", sizeLabel: "M", stockLevel: 9, isOrderable: true }] },
    },
  });
  const artwork = await prisma.artwork.create({
    data: {
      sellerId: seller.id, title: "E2E Sunrise", description: "e2e", status: "PUBLISHED",
      images: { create: [{ url: "https://picsum.photos/seed/e2e-print/600", gridUrl: "https://picsum.photos/seed/e2e-print/240", isPrimary: true, order: 0 }] },
    },
  });
  const print = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 120, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://picsum.photos/seed/e2e-print/1200" },
  });
  const order = await prisma.order.create({
    data: {
      buyerId, listingType: "CART", status: "PAID", subtotal: 72, totalAmount: 80,
      shippingName: "E2E Buyer", shippingLine1: "1 Test St", shippingCity: "Portland", shippingState: "OR", shippingPostal: "97201", shippingCountry: "US",
    },
  });
  const teemillFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "teemill", status: "CONFIRMED", providerOrderId: "e2e-teemill", shippingCost: 0 } });
  const prodigiFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "CONFIRMED", providerOrderId: "e2e-prodigi", shippingCost: 4.99 } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: tee.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: teemillFo.id } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1, unitPrice: 40, fulfillmentOrderId: prodigiFo.id } });
  emit({ orderId: order.id, teemillFoId: teemillFo.id, prodigiFoId: prodigiFo.id, listingId: tee.id, artworkId: artwork.id });
}

async function setStatus(foId: string, status: string, tracking?: string, carrier?: string) {
  await prisma.fulfillmentOrder.update({
    where: { id: foId },
    data: { status: status as never, ...(tracking ? { trackingNumber: tracking, carrier: carrier || null } : {}) },
  });
  emit({ ok: true });
}

async function ensureSeller() {
  const passwordHash = await bcrypt.hash(E2E_SELLER.password, 12);
  const u = await prisma.user.upsert({
    where: { email: E2E_SELLER.email },
    update: { passwordHash, emailVerified: new Date(), roles: ["SELLER"] },
    create: { email: E2E_SELLER.email, name: "E2E Seller", passwordHash, emailVerified: new Date(), roles: ["SELLER"] },
  });
  emit({ id: u.id });
}

// A prints-enabled listing offering one canvas aspect (8×10 → 4:5) so the edit
// page renders the framing panel + interactive tool (US-MFTF-PF.3 Playwright cover).
async function seedFramingListing(sellerId: string) {
  const source = await framingSourceDataUrl();
  const artwork = await prisma.artwork.create({
    data: {
      sellerId, title: "E2E Framing Source", description: "e2e framing", status: "PUBLISHED",
      images: { create: [{ url: source, isPrimary: true, order: 0 }] },
    },
  });
  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE",
      availableForPrint: true,
      printSourceImageUrl: source,
      printProducts: [{ sku: "GLOBAL-CAN-8X10", size: "8×10 in", price: 90 }],
    },
  });
  emit({ listingId: listing.id, artworkId: artwork.id });
}

async function getFraming(artworkId: string) {
  const rows = await prisma.printFraming.findMany({ where: { artworkId } });
  emit({ count: rows.length, framed: rows.filter((r) => r.croppedUrl && !r.needsReframe).map((r) => r.aspectRatio) });
}

async function cleanupArtwork(artworkId: string) {
  await prisma.artwork.delete({ where: { id: artworkId } }).catch(() => {}); // cascades OriginalListing + framing + images
  emit({ ok: true });
}

async function cleanup(orderId: string, listingId: string, artworkId: string) {
  await prisma.order.delete({ where: { id: orderId } }).catch(() => {}); // cascades OrderItem + FulfillmentOrder
  await prisma.apparelListing.delete({ where: { id: listingId } }).catch(() => {});
  await prisma.artwork.delete({ where: { id: artworkId } }).catch(() => {}); // cascades OriginalListing + images
  emit({ ok: true });
}

const [cmd, ...a] = process.argv.slice(2);
const dispatch: Record<string, () => Promise<void>> = {
  "ensure-buyer": () => ensureBuyer(),
  "ensure-seller": () => ensureSeller(),
  "seed-order": () => seedOrder(a[0]),
  "seed-framing-listing": () => seedFramingListing(a[0]),
  "get-framing": () => getFraming(a[0]),
  "cleanup-artwork": () => cleanupArtwork(a[0]),
  "set-status": () => setStatus(a[0], a[1], a[2] || undefined, a[3] || undefined),
  "cleanup": () => cleanup(a[0], a[1], a[2]),
};
const fn = dispatch[cmd];
if (!fn) {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}
fn().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
