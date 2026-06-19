import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { mapProdigiEventToStatus, type ProdigiWebhookEvent } from "@/lib/fulfillment/providers/prodigi";
import { applyFulfillmentTransition } from "@/lib/fulfillment/status";

// Prodigi provider-status webhook (US-MFTF-14.1). Public endpoint — there is no auth
// session; the request body is UNTRUSTED and MUST be verified against Prodigi's
// signature before any processing. Verified events are parsed into a provider-agnostic
// shape and handed to the shared transition seam (US-MFTF-14.2); this route contains
// no status-transition logic of its own.
//
// NOTE: there is intentionally NO Teemill webhook route — Teemill webhook support is
// unverified, so its status detection stays on polling (GET /orders/{ref}, the daily
// reconciliation cron in US-MFTF-12.6).
// TODO: replace Teemill polling with a webhook once the payload shape is confirmed live.

/**
 * Verify the Prodigi webhook signature over the raw request body.
 * // UNVERIFIED: exact header name + scheme — assumed HMAC-SHA256 hex digest of the
 * raw body keyed by PRODIGI_WEBHOOK_SECRET (documented in docs/prodigi-api-notes.md →
 * Webhooks). Compared timing-safely; a missing secret or signature fails closed.
 */
function verifyProdigiSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PRODIGI_WEBHOOK_SECRET ?? "";
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  return provided.length === computed.length && crypto.timingSafeEqual(provided, computed);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("prodigi-signature");

  if (!verifyProdigiSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

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
