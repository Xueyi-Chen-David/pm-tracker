import { db } from "@/server/db";
import { getActiveOrg } from "@/server/org";

/** 提供週報內文圖片（需登入且屬於目前組織；長快取，內容不可變）。 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getActiveOrg();
  if (!ctx) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const img = await db.reportImage.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!img) return new Response("not found", { status: 404 });

  const body = new Uint8Array(img.data);
  return new Response(body, {
    headers: {
      "content-type": img.mime,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
