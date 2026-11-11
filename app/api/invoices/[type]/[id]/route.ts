import { NextRequest, NextResponse } from "next/server";
import { authorizeInvoiceAccess } from "@/lib/invoice-access";
import { downloadInvoiceObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;

  const access = await authorizeInvoiceAccess(type, id);
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    );
  }

  const file = await downloadInvoiceObject(access.path);
  if (!file) {
    return NextResponse.json(
      { success: false, error: "Documento indisponivel" },
      { status: 404 }
    );
  }

  const inlineTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf"
  ]);
  const contentType = inlineTypes.has(file.contentType)
    ? file.contentType
    : "application/octet-stream";
  const extension = contentType === "application/pdf"
    ? ".pdf"
    : contentType === "image/png"
      ? ".png"
      : contentType === "image/webp"
        ? ".webp"
        : contentType === "image/gif"
          ? ".gif"
          : contentType === "image/jpeg"
            ? ".jpg"
            : ".bin";
  const download = req.nextUrl.searchParams.get("download") === "1";
  const forceDownload = download || contentType === "application/octet-stream";
  const disposition = forceDownload ? "attachment" : "inline";

  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="nota-fiscal${extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
