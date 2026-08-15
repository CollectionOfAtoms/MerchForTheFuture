// Low-level Printify API client helpers (US-MFTF-17.2).
//
// Verified against a live PRINTIFY_API_KEY (see docs/printify-api-notes.md,
// "live-verified 2026-07-12"):
//   - Base URL: https://api.printify.com/v1
//   - Auth: Authorization: Bearer {PRINTIFY_API_KEY} (a Personal Access Token).
//   - A User-Agent header is required by Printify.
//   - Order/product/webhook endpoints are SHOP-scoped (/shops/{shop_id}/…); the
//     shop id is pinned via PRINTIFY_SHOP_ID rather than re-fetched every call.
//   - Global rate limit 600/min, surfaced on X-RateLimit-Remaining.

export const PRINTIFY_API_BASE =
  process.env.PRINTIFY_API_BASE_URL ?? "https://api.printify.com/v1";

const USER_AGENT = "MerchForTheFuture/1.0 (+https://merchforthefuture.com)";

export function getPrintifyApiKey(): string {
  return process.env.PRINTIFY_API_KEY ?? "";
}

/** The pinned Printify shop id from the env, or "" when unset. */
export function getPrintifyShopId(): string {
  return (process.env.PRINTIFY_SHOP_ID ?? "").trim();
}

let cachedShopId: string | null = null;

/** Reset the fetched-shop-id cache. Test-only. */
export function __resetPrintifyShopIdCache(): void {
  cachedShopId = null;
}

/**
 * Resolve the Printify shop id for shop-scoped endpoints (Printify's analog of
 * Teemill's `project` claim). Prefers PRINTIFY_SHOP_ID; when unset, fetches
 * `GET /shops.json` once and caches the first shop's id.
 *
 * This matters because every shop-scoped call (`/shops/{id}/…`) builds a MALFORMED
 * `/shops//…` path — a 404 — when the id is missing, which is exactly how a checkout
 * shipping quote fails if PRINTIFY_SHOP_ID was never set. Pinning the env var still
 * avoids the extra call.
 */
export async function resolvePrintifyShopId(): Promise<string> {
  const pinned = getPrintifyShopId();
  if (pinned) return pinned;
  if (cachedShopId) return cachedShopId;

  const res = await printifyGet("/shops.json");
  if (!res.ok) throw await printifyError(res, "resolve shop id (GET /shops.json)");
  const shops = (await res.json()) as Array<{ id?: number | string }>;
  const id = shops[0]?.id;
  if (id == null || String(id).trim() === "") {
    throw new Error(
      "Printify: no shop found on this account. Create a shop in Printify (or set PRINTIFY_SHOP_ID).",
    );
  }
  cachedShopId = String(id);
  return cachedShopId;
}

/** Webhook signing secret (HMAC-SHA256 over the raw body). */
export function getPrintifyWebhookSecret(): string {
  return process.env.PRINTIFY_WEBHOOK_SECRET ?? "";
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getPrintifyApiKey()}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
}

/**
 * Log the remaining request budget when it runs low, so a catalog sync can be
 * paced from the header rather than guessing (docs: global 600/min).
 */
function noteRateLimit(resp: Response): void {
  const remaining = Number(resp.headers.get("X-RateLimit-Remaining") ?? "");
  if (Number.isFinite(remaining) && remaining <= 20) {
    console.warn(`[printify] rate limit low: ${remaining} requests remaining this window`);
  }
}

/** Authenticated GET against the Printify API. */
export async function printifyGet(path: string): Promise<Response> {
  const resp = await fetch(`${PRINTIFY_API_BASE}${path}`, { headers: headers(), cache: "no-store" });
  noteRateLimit(resp);
  return resp;
}

/** Authenticated POST against the Printify API. */
export async function printifyPost(path: string, body: unknown): Promise<Response> {
  const resp = await fetch(`${PRINTIFY_API_BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  noteRateLimit(resp);
  return resp;
}

/**
 * Build a descriptive Error from a failed Printify response, capturing the body so
 * the real reason is visible in logs and surfaced to the caller (mirrors teemillError).
 */
export async function printifyError(resp: Response, context: string): Promise<Error> {
  const body = await resp.text().catch(() => "");
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    if (parsed?.message) detail = parsed.message;
    else if (parsed?.error) detail = parsed.error;
  } catch {
    /* body was not JSON — keep the raw text */
  }
  console.error(`[printify] ${context} → ${resp.status}: ${body || "(empty body)"}`);
  return new Error(`Printify ${context} failed (${resp.status})${detail ? `: ${detail}` : ""}`);
}
