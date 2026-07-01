import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getActiveOrg } from "@/server/org";

const DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;
const MAX_BYTES = 8 * 1024 * 1024;

/** 上傳一張週報內文圖片（body 為 data URL），回傳可引用的短網址。 */
export async function POST(req: Request) {
  const ctx = await getActiveOrg();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dataUrl = await req.text();
  const m = DATA_URL.exec(dataUrl);
  if (!m) return NextResponse.json({ error: "invalid image" }, { status: 400 });

  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }

  const img = await db.reportImage.create({
    data: { data: buf, mime: m[1], organizationId: ctx.org.id },
    select: { id: true },
  });
  return NextResponse.json({ id: img.id, url: `/api/report-image/${img.id}` });
}
