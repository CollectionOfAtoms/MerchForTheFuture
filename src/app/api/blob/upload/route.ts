import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  const roles: string[] = user?.roles ?? [];
  if (!user?.id || (!roles.includes("SELLER") && !roles.includes("ADMIN"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;
  const token =
    process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

  const result = await handleUpload({
    token,
    body,
    request,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: ["image/jpeg", "image/png", "image/tiff", "image/webp"],
      maximumSizeInBytes: 70 * 1024 * 1024,
    }),
    onUploadCompleted: async () => {
      // URL is handled client-side after upload; nothing to do here
    },
  });

  return NextResponse.json(result);
}
