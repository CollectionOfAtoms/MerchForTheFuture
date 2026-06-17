// Shipment-status reconciliation cron (US-MFTF-12.6). Polls each placed-but-not-
// yet-shipped FulfillmentOrder for dispatch + tracking and emails the buyer per
// shipment. Scheduled once daily in vercel.json — Hobby-compatible (daily or
// slower) and respectful of Teemill's unknown rate limit (Open Q#3). Despite the
// route name it reconciles ALL providers (Prodigi too); Teemill is the one that
// must poll because its webhook support is unconfirmed (Open Q#2).
// TODO: replace Teemill polling with a webhook once the payload shape is confirmed live.
import { NextResponse } from "next/server";
import { checkAndSyncShipments } from "@/lib/checkout/shipments";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkAndSyncShipments();
  return NextResponse.json(result);
}
