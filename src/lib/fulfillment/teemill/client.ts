// Low-level Teemill Orders API client helpers.
//
// Verified auth (see /docs/teemill-api-notes.md, "Live API Verification 2026-06-12"):
//   - Authorization: {TEEMILL_API_KEY}  — the RAW key, with NO "Bearer" prefix.
//   - ?project={sub}                    — the JWT `sub` claim on the key
//     (e.g. "merchforthefuture-451391"), NOT the public key (which 404s).

export const TEEMILL_API_BASE =
  process.env.TEEMILL_API_BASE_URL ?? "https://api.teemill.com/v1";

/** The raw API key (a JWT) used verbatim in the Authorization header. */
export function getTeemillApiKey(): string {
  return process.env.TEEMILL_API_KEY ?? "";
}

/**
 * The `project` query parameter — the JWT `sub` claim on the API key. Decoded
 * from the key's payload segment; an explicit `TEEMILL_PROJECT` env var wins if
 * set. Falls back to an empty string so a missing key surfaces as an auth error
 * from Teemill rather than throwing here.
 */
export function getTeemillProject(): string {
  if (process.env.TEEMILL_PROJECT) return process.env.TEEMILL_PROJECT;
  const key = getTeemillApiKey();
  const payload = key.split(".")[1];
  if (!payload) return "";
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json) as { sub?: string };
    return claims.sub ?? "";
  } catch {
    return "";
  }
}

/** Public Teemill site base (the designer/editor live here, not on the API host). */
export const TEEMILL_SITE = process.env.TEEMILL_SITE_URL ?? "https://teemill.com";

function projectQuery(): string {
  const project = getTeemillProject();
  return project ? `?project=${encodeURIComponent(project)}` : "";
}

/**
 * The generic Teemill product designer, scoped to this project — where the
 * founder starts a brand-new product. Live-confirmed pattern (2026-06-13):
 *   https://teemill.com/create-a-product/?project={projectId}
 */
export function teemillDesignerUrl(): string {
  return `${TEEMILL_SITE}/create-a-product/${projectQuery()}`;
}

/**
 * Outbound "Edit on Teemill" deep-link for a referenced product. Live-confirmed
 * pattern (2026-06-13): the per-product editor is
 *   https://teemill.com/create-a-product/{slug}/?project={projectId}
 * where `slug` is captured from the catalog at ingest and `projectId` is the JWT
 * `sub` on the API key. When no slug is known (e.g. a pre-existing listing not
 * yet re-synced), fall back to the generic project-scoped designer rather than
 * guessing a URL.
 */
export function teemillEditUrl(opts: { slug?: string | null; ref?: string | null } = {}): string {
  const slug = opts.slug?.trim();
  if (slug) {
    return `${TEEMILL_SITE}/create-a-product/${encodeURIComponent(slug)}/${projectQuery()}`;
  }
  return teemillDesignerUrl();
}

/** Authenticated GET against the Teemill Orders API. */
export async function teemillGet(path: string): Promise<Response> {
  const project = encodeURIComponent(getTeemillProject());
  const sep = path.includes("?") ? "&" : "?";
  return fetch(`${TEEMILL_API_BASE}${path}${sep}project=${project}`, {
    headers: {
      Authorization: getTeemillApiKey(),
      "Content-Type": "application/json",
    },
    // Always read live catalog data; the cached snapshot lives in our DB.
    cache: "no-store",
  });
}

/**
 * A syntactically valid contact for the Orders API. Teemill rejects an order
 * create with an empty/invalid email (400), so the shipping-quote step needs a
 * real address even though it never confirms an order. Override per-deploy with
 * TEEMILL_CONTACT_EMAIL / TEEMILL_CONTACT_PHONE; the buyer's own email is used at
 * fulfillment time instead (see provider.fulfill).
 */
export function teemillDefaultContact(): { email: string; phone: string } {
  return {
    email: process.env.TEEMILL_CONTACT_EMAIL || "orders@merchforthefuture.quest",
    phone: process.env.TEEMILL_CONTACT_PHONE || "",
  };
}

/**
 * Build a descriptive Error from a failed Teemill response, capturing the body
 * (Teemill returns `{ "message": "..." }` on 400) so the real reason is visible in
 * logs and surfaced to the caller instead of a bare status code.
 */
export async function teemillError(resp: Response, context: string): Promise<Error> {
  const body = await resp.text().catch(() => "");
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed?.message) detail = parsed.message;
  } catch {
    /* body was not JSON — keep the raw text */
  }
  console.error(`[teemill] ${context} → ${resp.status}: ${body || "(empty body)"}`);
  return new Error(`Teemill ${context} failed (${resp.status})${detail ? `: ${detail}` : ""}`);
}

/** Authenticated POST against the Teemill Orders API (order create / confirm). */
export async function teemillPost(path: string, body: unknown): Promise<Response> {
  const project = encodeURIComponent(getTeemillProject());
  const sep = path.includes("?") ? "&" : "?";
  return fetch(`${TEEMILL_API_BASE}${path}${sep}project=${project}`, {
    method: "POST",
    headers: {
      Authorization: getTeemillApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}
