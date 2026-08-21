import crypto from "node:crypto";

/**
 * 對稱加密工具（server-only）：目前唯一用途是組織自訂 Google 服務帳戶私鑰在資料庫裡的
 * 靜態加密（見 google-calendar.ts）。用 Node 內建 crypto 的 AES-256-GCM，不裝額外套件
 * ——沿用這個 repo（server/gemini.ts、server/google-calendar.ts）一貫「不裝 SDK」的作法。
 *
 * 金鑰來自 env ENCRYPTION_KEY：`openssl rand -base64 32` 產生的 32 bytes，base64 編碼。
 * 未設定時 isEncryptionConfigured() 回 false，呼叫端（google-calendar.ts）應該當作
 * 「這個組織的自訂憑證功能不可用」處理，不是整個 App 掛掉。
 *
 * 密文格式：`<iv base64>:<authTag base64>:<ciphertext base64>`，存進資料庫的單一
 * String 欄位。GCM 的 authTag 已經提供完整性驗證，解密時 tag 對不上會直接丟錯
 * （不像 google-calendar.ts 其他函式那樣吞掉錯誤——密鑰打錯 / 資料被竄改是設定錯誤，
 * 應該讓呼叫端知道，而不是靜默當作「沒設定」）。
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 建議 96-bit IV

function getKey(): Buffer | null {
  const raw = (process.env.ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (key.length !== 32) return null; // AES-256 需要剛好 32 bytes
  return key;
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

/** 加密一段明文，回傳可直接存進資料庫的字串。ENCRYPTION_KEY 未設定或格式錯誤時丟錯。 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) {
    throw new Error("ENCRYPTION_KEY 未設定或格式不正確（需為 32 bytes 的 base64）。");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** 解密 encryptSecret 產生的字串。金鑰不對、格式錯誤、或內容被竄改（authTag 對不上）都會丟錯。 */
export function decryptSecret(encoded: string): string {
  const key = getKey();
  if (!key) {
    throw new Error("ENCRYPTION_KEY 未設定或格式不正確（需為 32 bytes 的 base64）。");
  }
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("加密內容格式不正確。");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64!, "base64");
  const authTag = Buffer.from(authTagB64!, "base64");
  const ciphertext = Buffer.from(ciphertextB64!, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
