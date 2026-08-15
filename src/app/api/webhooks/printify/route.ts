import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  mapPrintifyEventToStatus,
  verifyPrintifySignature,
  type PrintifyWebhookEvent,
} from "@/lib/fulfillment/providers/printify";
import { getPrintifyWebhookSecret } from "@/lib/fulfillment/printify/client";
import { applyFulfillmentTransition } from "@/lib/fulfillment/status";

// Printify provider-status webhook (US-MFTF-17.2). Public endpoint — the request is
// UNTRUSTED and MUST be authenticated before any processing.
//
// AUTH MODEL: unlike Prodigi (unsigned, per-order token) Printify SIGNS the callback
// with HMAC-SHA256 over the raw body using the shop's webhook secret
// (PRINTIFY_WEBHOOK_SECRET). We verify the signature, then resolve the
// FulfillmentOrder by the order id carried in the (now-trusted) payload. Verified
// events are parsed into a provider-agnostic shape and handed to the shared
// transition seam (US-MFTF-14.2); this route contains no transition logic of its own.
//
// // UNVERIFIED (resolved at US-MFTF-17.3, needs a real webhook): the exact signature
// HEADER NAME (Printify signs HMAC-SHA256 but the header is not confirmed — we read a
// small set of likely names), and the event payload shapes. Until then, primary
// status detection ships on POLLING (checkFulfillmentStatus + the daily reconciliation
// cron), matching the Teemill precedent; this route is reference-grade.

/** Candidate signature header names (// UNVERIFIED — capture the real one live). */
const SIGNATURE_HEADERS = ["x-pfy-signature", "x-printify-signature", "x-signature"];

function readSignature(request: Request): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const v = request.headers.get(name);
    if (v) return v;
  }
  return null;
}

export async function POST(request: Request) {
  const raw = await request.text();

  // Authenticate: a valid HMAC-SHA256 signature over the raw body. No/invalid
  // signature → 401 (fail closed). The signature IS the trust anchor.
  const secret = getPrintifyWebhookSecret();
  if (!verifyPrintifySignature(raw, readSignature(request), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PrintifyWebhookEvent;
  try {
    event = JSON.parse(raw) as PrintifyWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Map the event to the provider-agnostic callback shape. An event outside the
  // handled set → acknowledge 200 and ignore (no transition, no retry storm).
  const parsed = mapPrintifyEventToStatus(event);
  if (!parsed) return NextResponse.json({ received: true, ignored: true });

  // Resolve the shipment from the (trusted) order id, then apply via the shared seam
  // (monotonic guard + idempotency + lifecycle email). A replayed webhook is a no-op.
  const fo = await prisma.fulfillmentOrder.findFirst({
    where: { provider: "printify", providerOrderId: parsed.providerOrderId },
    select: { id: true },
  });
  if (!fo) return NextResponse.json({ received: true, ignored: true });

  await applyFulfillmentTransition(fo.id, parsed.status, {
    trackingNumber: parsed.trackingNumber,
    carrier: parsed.carrier,
  });

  return NextResponse.json({ received: true });
}
