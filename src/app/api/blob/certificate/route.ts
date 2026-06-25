import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Blob upload for buyer tax-exemption certificates (US-5.2). Unlike the image
 * uploader, any authenticated user may upload here, and PDFs are allowed.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
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
      allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
      maximumSizeInBytes: 15 * 1024 * 1024,
    }),
    onUploadCompleted: async () => {
      // URL is handled client-side after upload; nothing to do here
    },
  });

  return NextResponse.json(result);
}
