// TODO: Upgrade Vercel to Pro and set schedule to "*/5 * * * *" for production.
// Currently runs once daily (Hobby plan limit).
import { NextResponse } from "next/server";
import { closeExpiredAuctions } from "@/lib/auctions/close";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await closeExpiredAuctions();
  return NextResponse.json(result);
}
