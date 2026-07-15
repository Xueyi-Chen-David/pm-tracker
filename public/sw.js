/* Project Pulse service worker — Web Push 桌面通知 + 番茄鐘完成通知。
   刻意只處理通知（不攔截 fetch / 不做離線快取），避免 Next.js 資源被快取住。 */

// 收到伺服器推播（關網頁時也會觸發）→ 顯示桌面通知。
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Project Pulse" };
  }
  const title = data.title || "Project Pulse";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    data: { link: data.link || "/" },
    icon: data.icon || undefined,
    badge: data.badge || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 點通知 → 聚焦既有分頁並前往連結，沒有分頁就開新視窗。
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          if ("navigate" in w && link) {
            try {
              await w.navigate(link);
            } catch {
              /* 跨來源或不可導覽時忽略 */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(link);
    })(),
  );
});

// 新版 SW 立即接管。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
