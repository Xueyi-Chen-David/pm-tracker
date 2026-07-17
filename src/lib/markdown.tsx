/**
 * 極簡、零依賴、無 XSS 風險的 markdown → React 渲染器。
 *
 * 直接產生 React 元素（不使用 dangerouslySetInnerHTML），所以文件內容
 * 即使含有 HTML 也只會被當成純文字，天生免疫跨成員的注入攻擊。
 *
 * 支援：標題(#…######)、無序 / 有序清單、待辦清單([ ] / [x])、引言(>)、
 * 程式碼區塊(```)、水平線(---)、表格、段落、以及行內的 **粗體**、*斜體*、
 * `行內碼`、~~刪除線~~、[連結](url)、![圖片](url)。
 *
 * 圖片支援擴充屬性：`![alt](url){width=300px align=center}`
 *   - width：像素(如 300 / 300px)或百分比(如 50%)。編輯器一律寫入像素——百分比
 *     會相對於「當下容器」解析，同一份文件在編輯預覽欄與閱讀版面就會不一樣大。
 *   - align：left | center | right（水平置左 / 置中 / 置右；僅對「獨佔一行」的區塊圖片生效）
 * 只允許安全的圖片來源（http(s):// 、站內相對路徑 / 、data:image/），其餘原樣顯示。
 */
import React from "react";

// ── 圖片：型別、來源 / 屬性解析、序列化 ──────────────────────────
export type ImgAlign = "left" | "center" | "right";

export type ParsedImage = {
  /** 在原始 markdown 內的起訖字元位置（供編輯器就地改寫屬性 / 刪除）。 */
  start: number;
  end: number;
  alt: string;
  url: string;
  width?: string; // 正規化後的 CSS 值，如 "50%" / "300px"
  align?: ImgAlign;
};

/** 僅允許安全的圖片來源，否則回傳 null（原樣當純文字，擋掉 javascript: 等）。 */
function safeImgSrc(url: string): string | null {
  return /^(https?:\/\/|\/|data:image\/)/i.test(url) ? url : null;
}

/** 把 `width=…` 正規化成合法 CSS 長度：純數字視為 px；百分比夾在 5–100%。 */
function normalizeWidth(v: string): string | undefined {
  const s = v.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,4})%$/.exec(s))) {
    return `${Math.min(100, Math.max(5, Number(m[1])))}%`;
  }
  if ((m = /^(\d{1,4})(?:px)?$/.exec(s))) {
    return `${Math.min(4000, Math.max(10, Number(m[1])))}px`;
  }
  return undefined;
}

/** 解析 `{width=… align=…}` 屬性字串。 */
function parseImgAttrs(raw?: string): { width?: string; align?: ImgAlign } {
  const res: { width?: string; align?: ImgAlign } = {};
  if (!raw) return res;
  for (const part of raw.trim().split(/\s+/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).toLowerCase();
    const val = part.slice(eq + 1);
    if (key === "width") {
      const w = normalizeWidth(val);
      if (w) res.width = w;
    } else if (key === "align") {
      const a = val.toLowerCase();
      if (a === "left" || a === "center" || a === "right") res.align = a;
    }
  }
  return res;
}

/** 把圖片欄位序列化回 markdown（align=left 為預設值，省略以保持乾淨）。 */
export function serializeImage(img: {
  alt: string;
  url: string;
  width?: string;
  align?: ImgAlign;
}): string {
  const attrs: string[] = [];
  if (img.width) attrs.push(`width=${img.width}`);
  if (img.align && img.align !== "left") attrs.push(`align=${img.align}`);
  return `![${img.alt}](${img.url})${attrs.length ? `{${attrs.join(" ")}}` : ""}`;
}

// 圖片語法（行內 / 區塊共用）。與 INLINE_SRC 內的圖片分支保持一致。
const IMAGE_RE_SRC = "!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)(?:\\{([^}]*)\\})?";

/** 把程式碼區塊 / 行內碼遮成等長空白，讓「找圖片」不會誤抓程式碼裡的圖片語法。 */
function maskCode(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, (b) => " ".repeat(b.length))
    .replace(/`[^`\n]*`/g, (b) => " ".repeat(b.length));
}

/**
 * 掃出內容裡「會被真正渲染成圖片」的所有圖片（排除程式碼區塊、來源不安全者），
 * 依文件順序回傳位置與屬性。渲染器的 data-md-index 與此順序一致，編輯器可據此
 * 就地改寫第 N 張圖片的屬性 / 刪除。
 */
export function findImages(content: string): ParsedImage[] {
  const masked = maskCode(content);
  const re = new RegExp(IMAGE_RE_SRC, "g");
  const out: ParsedImage[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const url = m[2];
    if (!safeImgSrc(url)) continue; // 與渲染器一致：只計入安全來源
    const { width, align } = parseImgAttrs(m[3]);
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      alt: m[1],
      url,
      width,
      align,
    });
  }
  return out;
}

// 渲染時共用的內文脈絡：全域圖片序號 + 目前選取的圖片序號（供編輯器高亮）。
type RenderCtx = { imgIndex: { n: number }; selected: number | null };

/** 渲染一張圖片元素（block=獨佔一行、可對齊；否則行內）。回傳 null＝來源不安全。 */
function renderImage(
  alt: string,
  url: string,
  attrsRaw: string | undefined,
  block: boolean,
  ctx: RenderCtx,
  key: string,
): React.ReactNode | null {
  const src = safeImgSrc(url);
  if (!src) return null;
  const { width, align } = parseImgAttrs(attrsRaw);
  const idx = ctx.imgIndex.n++;
  const selected = ctx.selected === idx;
  // 寬度掛在外層 wrapper 上（區塊圖＝flex item，% 相對於內容欄寬正確解析；
  // 行內圖＝相對段落寬）。img 則填滿 wrapper。selected 時右下角補一個可拖曳把手。
  const imgClass =
    `block h-auto ${block ? "rounded-md border" : "rounded"} ` +
    `${width ? "w-full" : "max-w-full"}${selected ? " ring-primary ring-2" : ""}`;
  const inner = (
    <span
      data-md-imgwrap={idx}
      className="relative inline-block align-middle"
      style={{ maxWidth: "100%", ...(width ? { width } : {}) }}
    >
      {/* 通用 markdown 渲染器需支援任意 / data: 來源，next/image 不適用。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} data-md-index={idx} loading="lazy" className={imgClass} />
      {selected && (
        <span
          data-md-resize={idx}
          title="拖曳調整大小"
          className="border-primary bg-background absolute -right-1.5 -bottom-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border-2 shadow-sm"
          style={{ touchAction: "none" }}
        />
      )}
    </span>
  );
  if (!block) return <React.Fragment key={key}>{inner}</React.Fragment>;
  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  return (
    <div key={key} className="my-3 flex" style={{ justifyContent: justify }}>
      {inner}
    </div>
  );
}

// ── 行內語法 ───────────────────────────────────────────────────
// 行內碼、![圖片](url)、**粗體**/__粗體__、~~刪除線~~、*斜體*/_斜體_、[文字](url)。
// 注意：renderInline 會遞迴呼叫自己解析巢狀樣式，所以每次都 new 一個獨立的
// RegExp——共用同一個帶 g 旗標的實例會因為 lastIndex 被內層呼叫改動而無限迴圈。
const INLINE_SRC =
  "(`[^`]+`)|(" +
  IMAGE_RE_SRC +
  ")|(\\*\\*[^*]+?\\*\\*)|(__[^_]+?__)|(~~[^~]+?~~)|(\\*[^*\\s][^*]*?\\*)|(_[^_\\s][^_]*?_)|(\\[[^\\]]+?\\]\\([^)\\s]+?\\))";

/** 僅允許安全的連結協定，否則原樣當純文字顯示（擋掉 javascript: 等）。 */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) ? url : null;
}

/** 把一段純文字解析成含行內樣式的 React 節點。 */
function renderInline(
  text: string,
  keyBase: string,
  ctx: RenderCtx,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_SRC, "g");
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const k = `${keyBase}-i${i++}`;
    if (token.startsWith("`")) {
      out.push(
        <code
          key={k}
          className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("![")) {
      const mt = new RegExp(`^${IMAGE_RE_SRC}$`).exec(token);
      const node = mt
        ? renderImage(mt[1], mt[2], mt[3], false, ctx, k)
        : null;
      // 來源不安全 / 解析失敗 → 原樣顯示 markdown 文字（且不計入圖片序號）。
      out.push(node ?? token);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push(
        <strong key={k} className="font-semibold">
          {renderInline(token.slice(2, -2), k, ctx)}
        </strong>,
      );
    } else if (token.startsWith("~~")) {
      out.push(
        <del key={k} className="text-muted-foreground">
          {renderInline(token.slice(2, -2), k, ctx)}
        </del>,
      );
    } else if (token.startsWith("[")) {
      const mt = /^\[([^\]]+?)\]\(([^)\s]+?)\)$/.exec(token);
      const href = mt ? safeHref(mt[2]) : null;
      if (mt && href) {
        const external = /^https?:\/\//i.test(href);
        out.push(
          <a
            key={k}
            href={href}
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
          >
            {renderInline(mt[1], k, ctx)}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else {
      // *斜體* 或 _斜體_
      out.push(
        <em key={k} className="italic">
          {renderInline(token.slice(1, -1), k, ctx)}
        </em>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// 清單項目語法；**最後一個捕捉群組固定是項目文字**（collectListItems 依賴這點）。
// 區塊解析器與段落的「遇到清單就收尾」判斷共用同一組樣式，兩邊若不一致，會出現
// 「段落不吃、清單也不吃」而卡住行號的無限迴圈。
const OL_ITEM_RE = /^\s*(\d+)\.\s+(.*)$/;
const UL_ITEM_RE = /^\s*[-*+]\s+(.*)$/;

/**
 * 從 from 開始收集同一份清單的項目文字。項目之間允許夾**一個**空行（markdown 的
 * loose list）——作者常一項空一行地寫，這些仍屬同一份清單，不該各自斷成新清單
 * （那會讓每一份 <ol> 都從 1 重新編號）。連兩個空行才視為清單結束。
 */
function collectListItems(
  lines: string[],
  from: number,
  itemRe: RegExp,
): { items: string[]; next: number } {
  const items: string[] = [];
  let i = from;
  while (i < lines.length) {
    const m = itemRe.exec(lines[i]);
    if (m) {
      items.push(m[m.length - 1]);
      i++;
      continue;
    }
    // 空行後若緊接著同型項目 → 同一份清單，吃掉這個空行繼續。
    if (
      lines[i].trim() === "" &&
      i + 1 < lines.length &&
      itemRe.test(lines[i + 1])
    ) {
      i++;
      continue;
    }
    break;
  }
  return { items, next: i };
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-5 mb-3 text-2xl font-bold tracking-tight first:mt-0",
  2: "mt-5 mb-2.5 text-xl font-bold tracking-tight first:mt-0",
  3: "mt-4 mb-2 text-lg font-semibold first:mt-0",
  4: "mt-4 mb-2 text-base font-semibold first:mt-0",
  5: "mt-3 mb-1.5 text-sm font-semibold first:mt-0",
  6: "text-muted-foreground mt-3 mb-1.5 text-sm font-semibold first:mt-0",
};

// 獨佔一行的圖片（區塊圖片）：`![alt](url){attrs}`。只認安全來源。
const BLOCK_IMG_RE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)(?:\s*\{([^}]*)\})?\s*$/;
function blockImageMatch(line: string): RegExpExecArray | null {
  const m = BLOCK_IMG_RE.exec(line);
  return m && safeImgSrc(m[2]) ? m : null;
}

/** 把 markdown 原文渲染成 React 元素。 */
export function Markdown({
  content,
  /** 編輯器用：目前選取中的圖片序號（依 findImages 順序），會加上高亮外框。 */
  selectedImageIndex = null,
}: {
  content: string;
  selectedImageIndex?: number | null;
}) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  const ctx: RenderCtx = { imgIndex: { n: 0 }, selected: selectedImageIndex };
  let i = 0;
  let key = 0;
  const nextKey = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // 空行 → 跳過
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 程式碼區塊 ```
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // 跳過收尾的 ```
      blocks.push(
        <pre
          key={nextKey()}
          className="bg-muted my-3 overflow-x-auto rounded-md p-3 text-[0.85em]"
        >
          <code className="font-mono">{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // 水平線
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={nextKey()} className="my-4 border-t" />);
      i++;
      continue;
    }

    // 標題
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      const k = nextKey();
      blocks.push(
        <Tag key={k} className={HEADING_CLASS[level]}>
          {renderInline(heading[2].trim(), k, ctx)}
        </Tag>,
      );
      i++;
      continue;
    }

    // 區塊圖片（獨佔一行）：可對齊 / 調整大小。
    const blockImg = blockImageMatch(line);
    if (blockImg) {
      const node = renderImage(
        blockImg[1],
        blockImg[2],
        blockImg[3],
        true,
        ctx,
        nextKey(),
      );
      if (node) blocks.push(node);
      i++;
      continue;
    }

    // 引言 >
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      const k = nextKey();
      blocks.push(
        <blockquote
          key={k}
          className="text-muted-foreground my-3 border-l-4 pl-3 italic"
        >
          {body.map((seg, si) => (
            <React.Fragment key={si}>
              {renderInline(seg, `${k}-${si}`, ctx)}
              {si < body.length - 1 && <br />}
            </React.Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    // 有序清單 1. 2. 3.
    const olStart = OL_ITEM_RE.exec(line);
    if (olStart) {
      const { items, next } = collectListItems(lines, i, OL_ITEM_RE);
      i = next;
      // 起始編號沿用作者寫的第一個數字（寫 `3.` 就從 3 開始）；其後由瀏覽器
      // 依序遞增，與 markdown 慣例一致——所以整份都寫 `1.` 仍會渲染成 1,2,3。
      const startAt = Math.min(1_000_000_000, Number(olStart[1]));
      const k = nextKey();
      blocks.push(
        <ol
          key={k}
          start={Number.isFinite(startAt) ? startAt : 1}
          className="my-3 list-decimal space-y-1 pl-6"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `${k}-${idx}`, ctx)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // 無序清單 - * +（含待辦 [ ] / [x]）
    if (UL_ITEM_RE.test(line)) {
      const { items, next } = collectListItems(lines, i, UL_ITEM_RE);
      i = next;
      const k = nextKey();
      blocks.push(
        <ul key={k} className="my-3 space-y-1 pl-2">
          {items.map((it, idx) => {
            const task = /^\[([ xX])\]\s+(.*)$/.exec(it);
            if (task) {
              const checked = task[1].toLowerCase() === "x";
              return (
                <li key={idx} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="accent-primary mt-1 h-3.5 w-3.5"
                  />
                  <span className={checked ? "text-muted-foreground line-through" : ""}>
                    {renderInline(task[2], `${k}-${idx}`, ctx)}
                  </span>
                </li>
              );
            }
            return (
              <li key={idx} className="flex gap-2">
                <span className="text-muted-foreground select-none">•</span>
                <span>{renderInline(it, `${k}-${idx}`, ctx)}</span>
              </li>
            );
          })}
        </ul>,
      );
      continue;
    }

    // 表格（GFM pipe table）：標題列 + 分隔列(---) + 資料列。
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (l: string): string[] => {
        let s = l.trim();
        if (s.startsWith("|")) s = s.slice(1);
        if (s.endsWith("|")) s = s.slice(0, -1);
        return s.split("|").map((c) => c.trim());
      };
      const header = parseRow(line);
      const aligns = parseRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(":");
        const r = c.endsWith(":");
        return (l && r ? "center" : r ? "right" : "left") as
          | "center"
          | "right"
          | "left";
      });
      i += 2;
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].includes("|") &&
        lines[i].trim() !== ""
      ) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      const k = nextKey();
      blocks.push(
        <div key={k} className="my-3 overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                {header.map((c, ci) => (
                  <th
                    key={ci}
                    className="border px-3 py-1.5 font-semibold"
                    style={{ textAlign: aligns[ci] ?? "left" }}
                  >
                    {renderInline(c, `${k}-h${ci}`, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="even:bg-muted/20">
                  {header.map((_, ci) => (
                    <td
                      key={ci}
                      className="border px-3 py-1.5"
                      style={{ textAlign: aligns[ci] ?? "left" }}
                    >
                      {renderInline(r[ci] ?? "", `${k}-${ri}-${ci}`, ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 段落：吃到下一個空行或區塊起始為止；行內單一換行 → <br/>
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !OL_ITEM_RE.test(lines[i]) &&
      !UL_ITEM_RE.test(lines[i]) &&
      !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]) &&
      !blockImageMatch(lines[i]) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])
      )
    ) {
      para.push(lines[i]);
      i++;
    }
    const k = nextKey();
    blocks.push(
      <p key={k} className="my-2 leading-relaxed">
        {para.map((seg, si) => (
          <React.Fragment key={si}>
            {renderInline(seg, `${k}-${si}`, ctx)}
            {si < para.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
