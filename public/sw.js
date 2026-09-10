const STATIC_CACHE = "hyw-drill-static-v2";
const STATIC_ASSETS = ["/", "/styles.css", "/app.js", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((response) => response || caches.match("/"))));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil(
    (async () => {
      const data = event.data.json();
      const isReport = data.kind === "report";
      const expired =
        !isReport && data.status !== "RESOLVED" && Date.now() > new Date(data.expiresAt).getTime();
      if (expired) return;
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: "PUSH_INCIDENT", payload: data });
      await self.registration.showNotification(data.title || "[การฝึกซ้อม] แจ้งเตือน", {
        body: data.body || "เปิดระบบเพื่อดูข้อมูล",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: data.tag,
        renotify: true,
        requireInteraction: true,
        data: { url: data.url || "/", incidentId: data.incidentId },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(event.notification.data?.url || "/");
          return client.focus();
        }
      }
      return self.clients.openWindow(event.notification.data?.url || "/");
    }),
  );
});
