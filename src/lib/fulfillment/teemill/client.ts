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
