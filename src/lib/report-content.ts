/**
 * 週報「整體說明」的內文區塊：文字與圖片依序排列。
 * 圖片的 raw data（data URL）只存在 image 區塊的 src，不會混進文字裡，
 * 所以純文字鏡像（summary）與任何 log 都不會夾帶又臭又長的 base64。
 */
export type ReportBlock =
  | { type: "text"; text: string }
  | { type: "image"; src: string };

/** 從 DB 的 Json 安全解析成區塊陣列。 */
export function parseBlocks(value: unknown): ReportBlock[] {
  if (!Array.isArray(value)) return [];
  const out: ReportBlock[] = [];
  for (const b of value) {
    if (b && typeof b === "object") {
      const o = b as Record<string, unknown>;
      if (o.type === "text" && typeof o.text === "string") {
        out.push({ type: "text", text: o.text });
      } else if (o.type === "image" && typeof o.src === "string") {
        out.push({ type: "image", src: o.src });
      }
    }
  }
  return out;
}

/** 純文字鏡像（只取文字區塊），給 summary 欄位 / 純文字情境。 */
export function blocksToText(blocks: ReportBlock[]): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** 區塊是否有實際內容（非空文字或任何圖片）。 */
export function hasBlockContent(blocks: ReportBlock[]): boolean {
  return blocks.some(
    (b) => (b.type === "text" && b.text.trim().length > 0) || b.type === "image",
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 舊版區塊 → HTML（供新版 doc 編輯器初始內容、相容舊資料）。 */
export function blocksToHtml(blocks: ReportBlock[]): string {
  return blocks
    .map((b) =>
      b.type === "text"
        ? `<p>${escapeHtml(b.text).replace(/\r?\n/g, "<br>")}</p>`
        : `<p><img src="${b.src}" /></p>`,
    )
    .join("");
}

/** doc 內文是否有實際內容（純文字或內嵌圖片）。 */
export function htmlHasContent(html: string): boolean {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0;
}

/**
 * 後端保險用的輕量消毒：移除危險標籤 / 事件屬性 / javascript: 協定。
 * 編輯器本身只產生安全內容（貼上一律轉純文字），此處為深度防禦。
 */
export function sanitizeReportHtml(html: string): string {
  let h = html;
  h = h.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|form|input|button)[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  h = h.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|form|input|button)[^>]*>/gi,
    "",
  );
  h = h.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  h = h.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  h = h.replace(/\son\w+\s*=\s*[^\s">]+/gi, "");
  h = h.replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"');
  h = h.replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
  return h;
}
