/**
 * Resolve a Printify catalog product into the ids our curated catalog needs
 * (US-MFTF-17.2). Printify's public product pages don't expose the API ids the
 * admin "New Printify product type" form asks for — this bridges that gap.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/printify-blueprint-lookup.ts <blueprintId | printify product URL> [printProviderId]
 *
 * Examples:
 *   # List every print provider offering the women's baby tee, with a colour/size summary
 *   npx tsx --env-file=.env.local scripts/printify-blueprint-lookup.ts 1580
 *   npx tsx --env-file=.env.local scripts/printify-blueprint-lookup.ts \
 *     "https://printify.com/app/products/1580/generic-brand/womens-baby-tee"
 *
 *   # Full colour -> size -> variant_id map for one (blueprint, print provider) pair
 *   npx tsx --env-file=.env.local scripts/printify-blueprint-lookup.ts 1580 <printProviderId>
 *
 * SAFETY: strictly READ-ONLY catalog GETs. Creates nothing, orders nothing,
 * fulfils nothing. Printify has no sandbox, but catalog reads are free + safe.
 */

const API_KEY = process.env.PRINTIFY_API_KEY;
const BASE = process.env.PRINTIFY_API_BASE_URL ?? "https://api.printify.com/v1";
const UA = "MerchForTheFuture/1.0 (+catalog-lookup US-MFTF-17.2)";

if (!API_KEY) {
  console.error("Set PRINTIFY_API_KEY in .env.local before running this script.");
  process.exit(1);
}

const rawArg = process.argv[2];
const providerArg = process.argv[3];
if (!rawArg) {
  console.error("Pass a blueprint id or a Printify product URL. See the header for usage.");
  process.exit(1);
}

/** Accept a bare id or a printify.com/app/products/{id}/... URL. */
function parseBlueprintId(arg: string): number | null {
  if (/^\d+$/.test(arg.trim())) return Number(arg.trim());
  const m = arg.match(/\/products\/(\d+)/);
  return m ? Number(m[1]) : null;
}

const blueprintId = parseBlueprintId(rawArg);
if (blueprintId == null) {
  console.error(`Could not read a blueprint id from "${rawArg}".`);
  process.exit(1);
}

async function pf<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, "User-Agent": UA, "Content-Type": "application/json" },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, body: body as T };
}

interface Variant {
  id: number;
  title?: string;
  options?: { color?: string; size?: string };
}

/** Group variants by colour, listing each colour's size -> variant_id map. */
function groupByColour(variants: Variant[]): Map<string, Array<{ size: string; id: number }>> {
  const byColour = new Map<string, Array<{ size: string; id: number }>>();
  for (const v of variants) {
    const colour = v.options?.color ?? "(no colour)";
    const size = v.options?.size ?? "(no size)";
    const list = byColour.get(colour) ?? [];
    list.push({ size, id: v.id });
    byColour.set(colour, list);
  }
  return byColour;
}

async function main() {
  // ── Blueprint detail ────────────────────────────────────────────────────────
  const detail = await pf<{ title?: string; brand?: string; model?: string; description?: string }>(
    `/catalog/blueprints/${blueprintId}.json`,
  );
  if (detail.status !== 200) {
    console.error(`Blueprint ${blueprintId} → HTTP ${detail.status}. Body: ${JSON.stringify(detail.body).slice(0, 200)}`);
    process.exit(1);
  }
  const d = detail.body;
  console.log(`\nBlueprint ${blueprintId}: ${d.title ?? "(untitled)"}`);
  console.log(`  brand: ${d.brand ?? "?"}   model: ${d.model ?? "?"}`);
  if (typeof d.description === "string") {
    console.log(`  description: ${d.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}`);
  }
  console.log(
    "  NOTE: fabric composition is NOT structured in the API — confirm the material standard on printify.com before curating (manual gate).",
  );

  // ── Print providers ─────────────────────────────────────────────────────────
  const providers = await pf<Array<{ id: number; title: string }>>(
    `/catalog/blueprints/${blueprintId}/print_providers.json`,
  );
  const provList = providers.body ?? [];
  console.log(`\nPrint providers offering this blueprint (${provList.length}):`);

  // If a specific provider was requested, show only its full variant map.
  const targets = providerArg
    ? provList.filter((p) => String(p.id) === String(providerArg))
    : provList;
  if (providerArg && targets.length === 0) {
    console.error(`Print provider ${providerArg} does not offer blueprint ${blueprintId}. Available: ${provList.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }

  for (const p of targets) {
    // show-out-of-stock=1 is REQUIRED to see the full colour/size range — the
    // default endpoint hides anything not currently in stock at this provider
    // (e.g. blueprint 1580/provider 99: 4 default vs 16 full variants).
    const variants = await pf<{ variants?: Variant[] }>(
      `/catalog/blueprints/${blueprintId}/print_providers/${p.id}/variants.json?show-out-of-stock=1`,
    );
    const vList = (variants.body?.variants ?? []).filter((v) => typeof v.id === "number");
    const byColour = groupByColour(vList);
    const sizes = [...new Set(vList.map((v) => v.options?.size).filter(Boolean))];

    console.log(
      `\n  ── print_provider_id ${p.id}: ${p.title} — ${vList.length} variants, ${byColour.size} colours, ${sizes.length} sizes`,
    );
    console.log(`     → curate this style as: blueprint_id=${blueprintId}, print_provider_id=${p.id}`);

    if (providerArg) {
      // Full colour -> size -> variant_id map for the chosen provider.
      for (const [colour, rows] of [...byColour.entries()].sort()) {
        const cells = rows
          .sort((a, b) => a.size.localeCompare(b.size))
          .map((r) => `${r.size}=${r.id}`)
          .join("  ");
        console.log(`     ${colour}:  ${cells}`);
      }
    } else {
      // Overview only: colours + size set, so the founder can compare providers.
      console.log(`     colours: ${[...byColour.keys()].sort().join(", ")}`);
      console.log(`     sizes:   ${sizes.join(", ")}`);
    }
  }

  if (!providerArg) {
    console.log(
      `\nNext: pick a provider (material standard + print quality are your call on printify.com), then re-run with its id\n  npx tsx --env-file=.env.local scripts/printify-blueprint-lookup.ts ${blueprintId} <printProviderId>\nto get the full colour → size → variant_id map. Enter blueprint_id + print_provider_id in the admin "New Printify product type" form; the app's sync-printify caches colours/sizes/variant ids automatically.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
