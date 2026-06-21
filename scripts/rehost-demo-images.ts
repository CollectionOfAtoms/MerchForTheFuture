/**
 * One-off data fix: rehost any external placeholder image (e.g. picsum.photos,
 * seeded by scripts/demo-mixed-order.ts) onto our own Vercel Blob storage and
 * repoint the DB rows at the blob URL.
 *
 * The public browse/shop renders catalog images through `next/image`, whose
 * remotePatterns only allow our Vercel Blob host — so an external src like
 * picsum.photos throws "hostname not configured" and crashes the page. Downloading
 * the image once and serving it from blob keeps the demo data intact and renderable
 * without whitelisting arbitrary external hosts.
 *
 * Idempotent: only rows whose URL still matches EXTERNAL_HOST are touched; a second
 * run is a no-op. Each distinct source URL is downloaded + uploaded once.
 *
 * Usage (against the dev DB): npx tsx --env-file=.env.local scripts/rehost-demo-images.ts
 */
import { put } from "@vercel/blob";
import { prisma } from "../src/lib/db";

const EXTERNAL_HOST = "picsum.photos";
const BLOB_TOKEN = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

const isExternal = (url: string | null | undefined): url is string => !!url && url.includes(EXTERNAL_HOST);

const cache = new Map<string, string>();
let uploads = 0;

/** Download an external image once and re-upload it to our Blob store; cached by src. */
async function rehost(src: string): Promise<string> {
  const cached = cache.get(src);
  if (cached) return cached;

  const res = await fetch(src);
  if (!res.ok) throw new Error(`fetch ${src} -> ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  const buffer = Buffer.from(await res.arrayBuffer());

  // Deterministic-ish path from the source seed so re-runs stay tidy.
  const slug = src.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60);
  const blob = await put(`rehosted-demo/${slug}-${Date.now()}.${ext}`, buffer, {
    access: "public",
    contentType,
    token: BLOB_TOKEN,
  });
  cache.set(src, blob.url);
  uploads++;
  console.log(`  uploaded ${src}\n        -> ${blob.url}`);
  return blob.url;
}

async function main() {
  if (!BLOB_TOKEN) {
    console.error("No BLOB_(PUBLIC_)READ_WRITE_TOKEN in env. Aborting.");
    process.exit(1);
  }

  // ── ApparelListingImage: originalUrl / displayUrl / gridUrl / thumbnailUrl ──
  const apparelImgs = await prisma.apparelListingImage.findMany({
    where: { OR: [{ originalUrl: { contains: EXTERNAL_HOST } }, { displayUrl: { contains: EXTERNAL_HOST } }, { gridUrl: { contains: EXTERNAL_HOST } }, { thumbnailUrl: { contains: EXTERNAL_HOST } }] },
  });
  for (const img of apparelImgs) {
    await prisma.apparelListingImage.update({
      where: { id: img.id },
      data: {
        originalUrl: isExternal(img.originalUrl) ? await rehost(img.originalUrl) : img.originalUrl,
        displayUrl: isExternal(img.displayUrl) ? await rehost(img.displayUrl) : img.displayUrl,
        gridUrl: isExternal(img.gridUrl) ? await rehost(img.gridUrl) : img.gridUrl,
        thumbnailUrl: isExternal(img.thumbnailUrl) ? await rehost(img.thumbnailUrl) : img.thumbnailUrl,
      },
    });
  }

  // ── ArtworkImage: url / displayUrl / gridUrl / thumbnailUrl ──
  const artworkImgs = await prisma.artworkImage.findMany({
    where: { OR: [{ url: { contains: EXTERNAL_HOST } }, { displayUrl: { contains: EXTERNAL_HOST } }, { gridUrl: { contains: EXTERNAL_HOST } }, { thumbnailUrl: { contains: EXTERNAL_HOST } }] },
  });
  for (const img of artworkImgs) {
    await prisma.artworkImage.update({
      where: { id: img.id },
      data: {
        url: isExternal(img.url) ? await rehost(img.url) : img.url,
        displayUrl: isExternal(img.displayUrl) ? await rehost(img.displayUrl) : img.displayUrl,
        gridUrl: isExternal(img.gridUrl) ? await rehost(img.gridUrl) : img.gridUrl,
        thumbnailUrl: isExternal(img.thumbnailUrl) ? await rehost(img.thumbnailUrl) : img.thumbnailUrl,
      },
    });
  }

  // ── OriginalListing.printSourceImageUrl ──
  const printListings = await prisma.originalListing.findMany({
    where: { printSourceImageUrl: { contains: EXTERNAL_HOST } },
    select: { id: true, printSourceImageUrl: true },
  });
  for (const l of printListings) {
    await prisma.originalListing.update({
      where: { id: l.id },
      data: { printSourceImageUrl: await rehost(l.printSourceImageUrl!) },
    });
  }

  console.log(`\n✅ Rehosted ${uploads} distinct image(s). Updated ${apparelImgs.length} apparel image row(s), ${artworkImgs.length} artwork image row(s), ${printListings.length} print listing(s).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
