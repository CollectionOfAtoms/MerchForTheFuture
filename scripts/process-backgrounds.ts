/**
 * Process seller background designs into a thumbnail + a full image and publish
 * them to Vercel Blob, recording the URLs in the manifest the background picker
 * reads (src/lib/apparel/background-designs.json).
 *
 * Add more designs: drop image files (png/jpg/webp) into assets/backgrounds/,
 * then run:
 *
 *   npx tsx --env-file=.env.local scripts/process-backgrounds.ts
 *
 * The filename is the design's id + label (sunburst.png -> id "sunburst",
 * label "Sunburst"). Idempotent by slug — already-processed designs are skipped;
 * pass --force to reprocess everything (e.g. after re-exporting a design).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { put } from "@vercel/blob";

const SRC_DIR = join(process.cwd(), "assets", "backgrounds");
const MANIFEST = join(process.cwd(), "src", "lib", "apparel", "background-designs.json");
const BLOB_TOKEN = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
const IMG_RE = /\.(png|jpe?g|webp)$/i;

interface Design {
  id: string;
  label: string;
  thumbUrl: string;
  fullUrl: string;
}

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const titleize = (slug: string) =>
  slug.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

async function main() {
  if (!BLOB_TOKEN) {
    console.error("No BLOB_(PUBLIC_)READ_WRITE_TOKEN in env. Run with --env-file=.env.local. Aborting.");
    process.exit(1);
  }
  const force = process.argv.includes("--force");

  let manifest: Design[] = [];
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    manifest = [];
  }

  let files: string[];
  try {
    files = readdirSync(SRC_DIR).filter((f) => IMG_RE.test(f)).sort();
  } catch {
    console.error(`No ${SRC_DIR} directory. Create it and drop design files in.`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.log(`No image files in ${SRC_DIR} — nothing to do.`);
    return;
  }

  const ts = Date.now();
  let processed = 0;

  for (const file of files) {
    const id = slugify(basename(file, extname(file)));
    if (!id) continue;
    if (manifest.some((d) => d.id === id) && !force) {
      console.log(`skip  ${file} (already in manifest)`);
      continue;
    }

    const buf = readFileSync(join(SRC_DIR, file));
    // Thumbnail for the picker swatch; full image composited behind the mockup.
    const [thumb, full] = await Promise.all([
      sharp(buf).resize(240, 240, { fit: "cover" }).webp({ quality: 82 }).toBuffer(),
      sharp(buf).resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
    ]);

    const [thumbBlob, fullBlob] = await Promise.all([
      put(`backgrounds/${id}-thumb-${ts}.webp`, thumb, { access: "public", contentType: "image/webp", token: BLOB_TOKEN }),
      put(`backgrounds/${id}-full-${ts}.webp`, full, { access: "public", contentType: "image/webp", token: BLOB_TOKEN }),
    ]);

    const design: Design = { id, label: titleize(id), thumbUrl: thumbBlob.url, fullUrl: fullBlob.url };
    const existing = manifest.findIndex((d) => d.id === id);
    if (existing >= 0) manifest[existing] = design;
    else manifest.push(design);
    processed++;
    console.log(`ok    ${file} -> ${design.label}\n        thumb ${design.thumbUrl}\n        full  ${design.fullUrl}`);
  }

  manifest.sort((a, b) => a.label.localeCompare(b.label));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${processed} processed. Manifest now has ${manifest.length} design${manifest.length === 1 ? "" : "s"}: ${MANIFEST}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
