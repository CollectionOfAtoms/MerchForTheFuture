import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { mapProdigiEventToStatus, type ProdigiWebhookEvent } from "@/lib/fulfillment/providers/prodigi";
import { applyFulfillmentTransition } from "@/lib/fulfillment/status";

// Prodigi provider-status webhook (US-MFTF-14.1). Public endpoint — there is no auth
// session; the request is UNTRUSTED and MUST be authenticated before any processing.
//
// AUTH MODEL (confirmed against Prodigi's callback docs, 2026-06-19): Prodigi does NOT
// sign callback payloads and does NOT issue a signing secret — you only register a
// callback URL (globally in the dashboard, or per-order via `callbackUrl`), and the
// body is an unsigned CloudEvents payload. The supported way to secure it is therefore
// a shared secret YOU choose, embedded as a `?token=` query param in the registered
// URL; this route rejects any request whose token doesn't match PRODIGI_WEBHOOK_SECRET.
// Defence in depth: even past the token, only enumerated event types act, and the
// order must resolve by providerOrderId. Verified events are parsed into a provider-
// agnostic shape and handed to the shared transition seam (US-MFTF-14.2); this route
// contains no status-transition logic of its own.
//
// NOTE: there is intentionally NO Teemill webhook route — Teemill webhook support is
// unverified, so its status detection stays on polling (GET /orders/{ref}, the daily
// reconciliation cron in US-MFTF-12.6).
// TODO: replace Teemill polling with a webhook once the payload shape is confirmed live.

/**
 * Authenticate a Prodigi callback by the shared secret token embedded in the
 * registered callback URL (`?token=<PRODIGI_WEBHOOK_SECRET>`). Compared timing-safely;
 * a missing secret or token fails closed (401).
 */
function verifyProdigiToken(request: Request): boolean {
  const secret = process.env.PRODIGI_WEBHOOK_SECRET ?? "";
  if (!secret) return false;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!verifyProdigiToken(request)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const rawBody = await request.text();

  let event: ProdigiWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ProdigiWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Map the verified event to the provider-agnostic callback shape. An event type
  // outside the handled set → acknowledge 200 and ignore (no transition, no error),
  // so unexpected provider events never trigger retry storms.
  const parsed = mapProdigiEventToStatus(event);
  if (!parsed) return NextResponse.json({ received: true, ignored: true });

  const fo = await prisma.fulfillmentOrder.findFirst({
    where: { provider: "prodigi", providerOrderId: parsed.providerOrderId },
    select: { id: true },
  });
  if (!fo) return NextResponse.json({ received: true, ignored: true });

  // The shared seam applies the monotonic guard + idempotency + lifecycle email.
  // A replayed webhook for an already-applied transition is a no-op there.
  await applyFulfillmentTransition(fo.id, parsed.status, {
    trackingNumber: parsed.trackingNumber,
    carrier: parsed.carrier,
  });

  return NextResponse.json({ received: true });
}
