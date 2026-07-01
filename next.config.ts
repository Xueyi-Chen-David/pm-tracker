import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 此 workspace 含多個 lockfile，明確指定本專案為 Turbopack root，消除推斷警告。
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // 週報「整體說明」可夾帶圖片（以壓縮後的 data URL 存），放寬 Server Action 上限。
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
