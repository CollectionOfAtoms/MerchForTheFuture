import { NextResponse } from "next/server";
import { generateVariants } from "@/lib/artworks/variants";

export async function POST(request: Request): Promise<NextResponse> {
  let imageId: string | undefined;
  try {
    const body = await request.json();
    imageId = body?.imageId;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!imageId) {
    return NextResponse.json({ ok: false, error: "imageId is required" }, { status: 400 });
  }

  const result = await generateVariants(imageId);
  if (!result) {
    return NextResponse.json({ ok: false, error: "Variant generation failed or image not found" });
  }

  return NextResponse.json({ ok: true, ...result });
}
