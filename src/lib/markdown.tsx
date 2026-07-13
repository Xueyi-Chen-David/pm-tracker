/**
 * 極簡、零依賴、無 XSS 風險的 markdown → React 渲染器。
 *
 * 直接產生 React 元素（不使用 dangerouslySetInnerHTML），所以文件內容
 * 即使含有 HTML 也只會被當成純文字，天生免疫跨成員的注入攻擊。
 *
 * 支援：標題(#…######)、無序 / 有序清單、待辦清單([ ] / [x])、引言(>)、
 * 程式碼區塊(```)、水平線(---)、段落、以及行內的 **粗體**、*斜體*、
 * `行內碼`、~~刪除線~~、[連結](url)。刻意不做表格等進階語法（保持「簡易」）。
 */
import React from "react";

// ── 行內語法 ───────────────────────────────────────────────────
// 行內碼、**粗體**/__粗體__、~~刪除線~~、*斜體*/_斜體_、[文字](url)。
// 注意：renderInline 會遞迴呼叫自己解析巢狀樣式，所以每次都 new 一個獨立的
// RegExp——共用同一個帶 g 旗標的實例會因為 lastIndex 被內層呼叫改動而無限迴圈。
const INLINE_SRC =
  "(`[^`]+`)|(\\*\\*[^*]+?\\*\\*)|(__[^_]+?__)|(~~[^~]+?~~)|(\\*[^*\\s][^*]*?\\*)|(_[^_\\s][^_]*?_)|(\\[[^\\]]+?\\]\\([^)\\s]+?\\))";

/** 僅允許安全的連結協定，否則原樣當純文字顯示（擋掉 javascript: 等）。 */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) ? url : null;
}

/** 把一段純文字解析成含行內樣式的 React 節點。 */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
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
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push(
        <strong key={k} className="font-semibold">
          {renderInline(token.slice(2, -2), k)}
        </strong>,
      );
    } else if (token.startsWith("~~")) {
      out.push(
        <del key={k} className="text-muted-foreground">
          {renderInline(token.slice(2, -2), k)}
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
            {renderInline(mt[1], k)}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else {
      // *斜體* 或 _斜體_
      out.push(
        <em key={k} className="italic">
          {renderInline(token.slice(1, -1), k)}
        </em>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-5 mb-3 text-2xl font-bold tracking-tight first:mt-0",
  2: "mt-5 mb-2.5 text-xl font-bold tracking-tight first:mt-0",
  3: "mt-4 mb-2 text-lg font-semibold first:mt-0",
  4: "mt-4 mb-2 text-base font-semibold first:mt-0",
  5: "mt-3 mb-1.5 text-sm font-semibold first:mt-0",
  6: "text-muted-foreground mt-3 mb-1.5 text-sm font-semibold first:mt-0",
};

/** 把 markdown 原文渲染成 React 元素。 */
export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
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
          {renderInline(heading[2].trim(), k)}
        </Tag>,
      );
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
              {renderInline(seg, `${k}-${si}`)}
              {si < body.length - 1 && <br />}
            </React.Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    // 有序清單 1. 2. 3.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      const k = nextKey();
      blocks.push(
        <ol key={k} className="my-3 list-decimal space-y-1 pl-6">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `${k}-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // 無序清單 - * +（含待辦 [ ] / [x]）
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
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
                    {renderInline(task[2], `${k}-${idx}`)}
                  </span>
                </li>
              );
            }
            return (
              <li key={idx} className="flex gap-2">
                <span className="text-muted-foreground select-none">•</span>
                <span>{renderInline(it, `${k}-${idx}`)}</span>
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
                    {renderInline(c, `${k}-h${ci}`)}
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
                      {renderInline(r[ci] ?? "", `${k}-${ri}-${ci}`)}
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
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]) &&
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
            {renderInline(seg, `${k}-${si}`)}
            {si < para.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
