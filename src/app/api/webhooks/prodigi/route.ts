import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapProdigiEventToStatus, type ProdigiWebhookEvent } from "@/lib/fulfillment/providers/prodigi";
import { applyFulfillmentTransition } from "@/lib/fulfillment/status";

// Prodigi provider-status webhook (US-MFTF-14.1). Public endpoint — there is no auth
// session; the request is UNTRUSTED and MUST be authenticated before any processing.
//
// AUTH MODEL (confirmed against Prodigi's callback docs, 2026-06-19): Prodigi does NOT
// sign callback payloads and does NOT issue a signing secret — you only register a
// callback URL and the body is an unsigned CloudEvents payload (no signature header).
// We register a PER-ORDER `callbackUrl` at order-creation time (set in the fan-out,
// src/lib/checkout/fanout.ts) carrying an unguessable token unique to that
// FulfillmentOrder. This route authenticates AND resolves the shipment from that token
// alone (?token=…): a token that matches no shipment → 401; a leaked token compromises
// one order only; each environment self-addresses its own callbacks. Defence in depth:
// past the token, only enumerated event types act. Verified events are parsed into a
// provider-agnostic shape and handed to the shared transition seam (US-MFTF-14.2); this
// route contains no status-transition logic of its own.
//
// NOTE: there is intentionally NO Teemill webhook route — Teemill webhook support is
// unverified, so its status detection stays on polling (GET /orders/{ref}, the daily
// reconciliation cron in US-MFTF-12.6).
// TODO: replace Teemill polling with a webhook once the payload shape is confirmed live.

export async function POST(request: Request) {
  // Authenticate + resolve the shipment from the per-order token. No token, or a token
  // matching no Prodigi shipment → 401 (fail closed). The token IS the trust anchor;
  // the shipment is never resolved from the (untrusted) payload.
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const fo = token
    ? await prisma.fulfillmentOrder.findFirst({
        where: { provider: "prodigi", webhookToken: token },
        select: { id: true },
      })
    : null;
  if (!fo) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let event: ProdigiWebhookEvent;
  try {
    event = JSON.parse(await request.text()) as ProdigiWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Map the event to the provider-agnostic callback shape. An event type outside the
  // handled set → acknowledge 200 and ignore (no transition, no error), so unexpected
  // provider events never trigger retry storms.
  const parsed = mapProdigiEventToStatus(event);
  if (!parsed) return NextResponse.json({ received: true, ignored: true });

  // The shared seam applies the monotonic guard + idempotency + lifecycle email.
  // A replayed webhook for an already-applied transition is a no-op there.
  await applyFulfillmentTransition(fo.id, parsed.status, {
    trackingNumber: parsed.trackingNumber,
    carrier: parsed.carrier,
  });

  return NextResponse.json({ received: true });
}
