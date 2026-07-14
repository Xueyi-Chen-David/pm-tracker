/**
 * 打卡（check-in）驗證：純函式，方便測試與在 server action 重用。
 * 兩個維度：
 *   - 網段：來源 IP 命中允許清單（精確或 IPv4 CIDR）。
 *   - 地點：GPS 座標落在任一地理圍欄內。
 * 兩者以 matchMode 組合：
 *   - "any"：任一符合即通過（IP 或 地點）。
 *   - "all"：兩者皆須符合才通過（IP 且 地點）。
 * 只設定其中一個維度時，兩種模式行為相同（只需該維度通過）。
 */

export type Geofence = {
  label?: string;
  lat: number;
  lng: number;
  radiusM: number; // 半徑（公尺）
};

/** 通過方式："ip"＝僅網段、"gps"＝僅地點、"both"＝網段且地點（AND 模式兩者皆符合）。 */
export type CheckInMethod = "ip" | "gps" | "both";

/** 網段與地點的組合方式："any"＝任一符合、"all"＝兩者皆須符合。 */
export type CheckInMatchMode = "any" | "all";

/** 安全把任意值收斂成合法的 CheckInMatchMode（未知值一律回到 "any"）。 */
export function parseMatchMode(raw: unknown): CheckInMatchMode {
  return raw === "all" ? "all" : "any";
}

export type CheckInEvaluation = {
  valid: boolean;
  method: CheckInMethod | null;
  /** 未通過時的說明（給前端顯示）。 */
  reason?: string;
};

/** 去除 IPv4-mapped IPv6 前綴（::ffff:1.2.3.4 → 1.2.3.4）、小寫、去空白。 */
export function normalizeIp(ip: string): string {
  let s = ip.trim().toLowerCase();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  return s;
}

/** 從 x-forwarded-for / x-real-ip 取第一個（最外層 client）IP。 */
export function pickClientIp(
  xForwardedFor: string | null | undefined,
  xRealIp?: string | null,
): string | null {
  const xff = (xForwardedFor ?? "").split(",")[0]?.trim();
  const ip = xff || (xRealIp ?? "").trim();
  return ip ? normalizeIp(ip) : null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255 || p.trim() === "") return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** 某 IP 是否命中某規則（精確 IP 或 IPv4 CIDR，如 203.0.113.0/24）。 */
export function ipMatches(ip: string, pattern: string): boolean {
  const nip = normalizeIp(ip);
  const p = normalizeIp(pattern);
  if (!p) return false;
  if (p.includes("/")) return ipv4InCidr(nip, p);
  return nip === p;
}

/** IP 是否命中允許清單中任一規則。 */
export function ipAllowed(ip: string, patterns: string[]): boolean {
  return patterns.some((p) => p.trim() && ipMatches(ip, p));
}

/** 兩點間距離（公尺，haversine）。 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // 地球半徑（公尺）
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 座標是否落在任一地理圍欄範圍內。 */
export function withinGeofence(
  lat: number,
  lng: number,
  fences: Geofence[],
): boolean {
  return fences.some(
    (f) => haversineMeters(lat, lng, f.lat, f.lng) <= f.radiusM,
  );
}

/** 安全解析 Organization.checkInGeofences（Json）成 Geofence[]。 */
export function parseGeofences(raw: unknown): Geofence[] {
  if (!Array.isArray(raw)) return [];
  const out: Geofence[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    const radiusM = Number(o.radiusM);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!Number.isFinite(radiusM) || radiusM <= 0) continue;
    out.push({
      label: typeof o.label === "string" ? o.label : undefined,
      lat,
      lng,
      radiusM,
    });
  }
  return out;
}

/**
 * 綜合判斷一次打卡是否有效。
 * matchMode="any"：網段或地點任一符合即通過（預設，沿用舊行為）。
 * matchMode="all"：網段與地點皆須符合才通過；只設定其中一種條件時，等同只判該條件。
 */
export function evaluateCheckIn(input: {
  ip: string | null;
  lat: number | null;
  lng: number | null;
  allowedIps: string[];
  geofences: Geofence[];
  matchMode?: CheckInMatchMode;
}): CheckInEvaluation {
  const { ip, lat, lng, allowedIps, geofences } = input;
  const matchMode = input.matchMode ?? "any";
  const hasIpRule = allowedIps.some((p) => p.trim());
  const hasGeoRule = geofences.length > 0;

  if (!hasIpRule && !hasGeoRule) {
    return {
      valid: false,
      method: null,
      reason: "管理者尚未設定允許的打卡網路或地點。",
    };
  }

  const ipOk = hasIpRule && ip !== null && ipAllowed(ip, allowedIps);
  const geoOk =
    hasGeoRule &&
    lat !== null &&
    lng !== null &&
    withinGeofence(lat, lng, geofences);
  const missingGps = hasGeoRule && (lat === null || lng === null);

  const needs: string[] = [];
  if (hasIpRule) needs.push("在允許的網路（IP）內");
  if (hasGeoRule) needs.push("在允許的地點範圍內");

  if (matchMode === "all") {
    // 兩者皆須符合：只對「有設定」的維度要求通過（未設定的維度不構成限制）。
    const ipPass = !hasIpRule || ipOk;
    const geoPass = !hasGeoRule || geoOk;
    if (ipPass && geoPass) {
      const method: CheckInMethod =
        hasIpRule && hasGeoRule ? "both" : hasGeoRule ? "gps" : "ip";
      return { valid: true, method };
    }
    const base = `需同時${needs.join(" 且 ")}才能打卡`;
    const reason = missingGps
      ? `${base}；請允許瀏覽器定位，或連上公司網路。`
      : `${base}。`;
    return { valid: false, method: null, reason };
  }

  // matchMode === "any"：任一符合即通過。
  if (ipOk) return { valid: true, method: "ip" };
  if (geoOk) return { valid: true, method: "gps" };

  const reason = missingGps
    ? `需${needs.join(" 或 ")}才能打卡；請允許瀏覽器定位，或連上公司網路。`
    : `不在允許範圍：需${needs.join(" 或 ")}才能打卡。`;
  return { valid: false, method: null, reason };
}
