import { NextResponse } from "next/server";
import { generateApparelImageVariants } from "@/lib/artworks/variants";

export async function POST(request: Request): Promise<NextResponse> {
  let apparelImageId: string | undefined;
  try {
    const body = await request.json();
    apparelImageId = body?.apparelImageId;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!apparelImageId) {
    return NextResponse.json({ ok: false, error: "apparelImageId is required" }, { status: 400 });
  }

  const result = await generateApparelImageVariants(apparelImageId);
  if (!result) {
    return NextResponse.json({ ok: false, error: "Variant generation failed or image not found" });
  }

  return NextResponse.json({ ok: true, ...result });
}
