/**
 * 證明附件（data URL）共用驗證 —— 請假 / 事件用。
 * 目前無物件儲存，比照頭貼做法把小檔（圖片 / PDF）以 data URL 存進資料庫，故設容量上限。
 */

/** 允許的附件 data URL 格式（png/jpg/webp/gif/pdf）。 */
export const ATTACHMENT_DATA_URL_RE =
  /^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;

/** data URL 長度上限（約 1.2MB 原始檔）。 */
export const ATTACHMENT_MAX_LEN = 1_700_000;

/** 前端挑檔上限提示用（bytes）。 */
export const ATTACHMENT_MAX_BYTES = 1_200_000;

export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

/** 驗證附件 data URL；不合法回傳錯誤訊息，合法回傳 null。 */
export function validateAttachment(dataUrl: string): string | null {
  if (!ATTACHMENT_DATA_URL_RE.test(dataUrl)) {
    return "附件格式不支援（僅接受 JPG / PNG / WebP / GIF / PDF）。";
  }
  if (dataUrl.length > ATTACHMENT_MAX_LEN) {
    return "附件太大，請壓縮到約 1MB 以內。";
  }
  return null;
}
