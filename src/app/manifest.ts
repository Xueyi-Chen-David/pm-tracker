import type { MetadataRoute } from "next";

// PWA 安裝資訊：Android「加到主畫面」的安裝提示、圖示、啟動畫面顏色都吃這份。
// iOS Safari 不吃 manifest 的 display/start_url，靠 layout.tsx 的 appleWebApp
// meta 標籤另外處理（見該檔）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Project Pulse",
    short_name: "Project Pulse",
    description: "專案、出勤、請假、薪資、CRM 一站管理。",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
