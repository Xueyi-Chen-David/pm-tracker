// 產生 PWA / App 圖示 PNG（一次性腳本，非 build 流程的一部分）。
// 圖樣沿用側欄 Brand()：深底圓角方塊＋白色粗體「P」。
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BG = "#18181b"; // 深灰黑，對應側欄 bg-primary（深色系）
const FG = "#ffffff";

/** @param {number} size @param {{ maskableSafe?: boolean; rounded?: boolean }} opts */
function svgIcon(size, { maskableSafe = false, rounded = true } = {}) {
  const r = rounded ? size * 0.22 : 0;
  // maskable 圖示：背景滿版到邊緣，前景（P）留在安全區（約 80% 直徑的內接圓）內，
  // 避免 Android 自適應圖示套用圓形 / 方形遮罩時把字裁掉。
  const glyphSize = size * (maskableSafe ? 0.42 : 0.56);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Arial, 'Helvetica Neue', sans-serif" font-weight="700"
        font-size="${glyphSize}" fill="${FG}">P</text>
</svg>`;
}

const outDir = path.join(process.cwd(), "public", "icons");
await mkdir(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "maskable-512.png", size: 512, maskableSafe: true },
  { file: "apple-touch-icon.png", size: 180, rounded: false }, // iOS 自己套圓角
];

for (const t of targets) {
  const svg = svgIcon(t.size, t);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, t.file));
  console.log("wrote", t.file);
}

// 瀏覽器分頁 favicon（App Router icon.png 慣例，取代預設 Next.js 三角形圖示）。
const faviconSvg = svgIcon(48, { rounded: true });
await sharp(Buffer.from(faviconSvg))
  .png()
  .toFile(path.join(process.cwd(), "src", "app", "icon.png"));
console.log("wrote src/app/icon.png");
