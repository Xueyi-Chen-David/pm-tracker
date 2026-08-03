import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 此 workspace 含多個 lockfile，明確指定本專案為 Turbopack root，消除推斷警告。
  turbopack: {
    root: path.resolve(__dirname),
  },
  // web-push 走 Node（crypto），讓它在伺服器端以外部套件載入而非打包。
  serverExternalPackages: ["web-push"],
  experimental: {
    // 週報「整體說明」可夾帶圖片（以壓縮後的 data URL 存），放寬 Server Action 上限。
    serverActions: { bodySizeLimit: "12mb" },
  },
  // 關掉 dev 模式下 Server Action 呼叫的參數預覽 log——名片 / 頭貼這類帶 base64
  // 圖片的 action，參數預覽會把整包 data URL 印進終端機，洗版又沒用。
  logging: { serverFunctions: false },
};

export default nextConfig;
