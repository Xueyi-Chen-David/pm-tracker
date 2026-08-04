/**
 * 會議記錄圖片固定套用的樣式：浮動＋固定寬，讓文字像 Word 插入圖片一樣環繞排版。
 * 前端（meeting-notes-canvas.tsx）插入圖片時先套用一次（讓編輯畫面立刻看到正確排版）；
 * 後端（server/actions/meetings.ts）存檔前用 sanitize-html 再強制套用一次（不採信前端傳來
 * 的任何 class/style），兩邊共用同一個常數才不會日後改版面時漏改其中一邊。
 */
export const NOTE_IMG_CLASS =
  "float-left w-[180px] mr-3 mb-2 rounded-md border align-top";
