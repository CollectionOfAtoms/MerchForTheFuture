// Display FX-rate refresh cron (US-5.4). Scheduled once daily in vercel.json —
// Hobby-compatible (daily or slower). Rates are display-only; checkout settles in USD.
import { NextResponse } from "next/server";
import { refreshExchangeRates } from "@/lib/tax/fx";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshExchangeRates();
  return NextResponse.json(result);
}
