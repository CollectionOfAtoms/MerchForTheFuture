// Guest-cart cleanup cron (US-MFTF-11.6). Scheduled once daily in vercel.json —
// Hobby-compatible (daily or slower); do NOT add a sub-daily schedule here (that
// is the CHORE-1 auction concern and requires Vercel Pro).
import { NextResponse } from "next/server";
import { cleanupStaleGuestCarts } from "@/lib/cart/cleanup";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupStaleGuestCarts();
  return NextResponse.json(result);
}
