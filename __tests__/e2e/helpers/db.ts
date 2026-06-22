/**
 * E2E seed/verify API used by the Playwright specs. The actual DB work runs in a
 * `tsx` subprocess (helpers/seed-cli.ts) because the generated Prisma client is
 * CommonJS and Playwright's ESM transform can't load it directly. These wrappers are
 * synchronous (execFileSync); call sites may still `await` them harmlessly.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.join(process.cwd(), "__tests__/e2e/helpers/seed-cli.ts");
const TSX = path.join(process.cwd(), "node_modules/.bin/tsx");

function run<T>(args: string[]): T {
  const stdout = execFileSync(TSX, ["--env-file=.env.local", CLI, ...args], { encoding: "utf8" });
  const line = stdout.split("\n").reverse().find((l) => l.startsWith("RESULT:"));
  if (!line) throw new Error(`seed-cli produced no RESULT for [${args.join(" ")}]:\n${stdout}`);
  return JSON.parse(line.slice("RESULT:".length)) as T;
}

/** A dedicated, verified buyer account for E2E (kept distinct from real users). */
export const E2E_BUYER = { email: "e2e-buyer@mftf.test", password: "E2eBuyer123!" };

/** A dedicated, verified seller account for E2E (framing/listing-edit specs). */
export const E2E_SELLER = { email: "e2e-seller@mftf.test", password: "E2eSeller123!" };

export interface SeededOrder {
  orderId: string;
  teemillFoId: string;
  prodigiFoId: string;
  listingId: string;
  artworkId: string;
}

export function ensureBuyer(): { id: string } {
  return run<{ id: string }>(["ensure-buyer"]);
}

export function seedTwoShipmentOrder(buyerId: string): SeededOrder {
  return run<SeededOrder>(["seed-order", buyerId]);
}

export function setShipmentStatus(foId: string, status: string, trackingNumber?: string, carrier?: string): void {
  run(["set-status", foId, status, trackingNumber ?? "", carrier ?? ""]);
}

export function cleanupOrder(s: SeededOrder | undefined): void {
  if (s) run(["cleanup", s.orderId, s.listingId, s.artworkId]);
}

export function ensureSeller(): { id: string } {
  return run<{ id: string }>(["ensure-seller"]);
}

export interface SeededFramingListing {
  listingId: string;
  artworkId: string;
}

export function seedFramingListing(sellerId: string): SeededFramingListing {
  return run<SeededFramingListing>(["seed-framing-listing", sellerId]);
}

export function getFraming(artworkId: string): { count: number; framed: string[] } {
  return run<{ count: number; framed: string[] }>(["get-framing", artworkId]);
}

export function cleanupArtwork(artworkId: string | undefined): void {
  if (artworkId) run(["cleanup-artwork", artworkId]);
}
