import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("https://teemill.com/omnis/v3/product/options", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to reach Teemill" }, { status: 502 });
  }
}
