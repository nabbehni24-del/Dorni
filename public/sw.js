/* Cache only the public offline document; never cache API responses or account pages. */
const OFFLINE_CACHE = "dorni-offline-v1";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.add("/offline.html")));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("dorni-offline-") && key !== OFFLINE_CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});

// Receiver foundation only. Subscription and server dispatch are a separate rollout gate.
self.addEventListener("push", event => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* Show a safe generic alert. */ }
  event.waitUntil(self.registration.showNotification("دورني", {
    body: typeof message.body === "string" ? message.body.slice(0,180) : "عندك تنبيه جديد. افتح دورني للاطلاع عليه.",
    icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    tag: typeof message.tag === "string" ? message.tag.slice(0,100) : "dorni-alert",
    data: { url: "/app?tab=alerts" }, dir: "rtl", lang: "ar",
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  // Fixed same-origin destination: never navigate to a URL supplied by a push payload.
  const destination = new URL("/app?tab=alerts", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async windows => {
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === "/app") {
        await client.navigate(destination);
        return client.focus();
      }
    }
    return self.clients.openWindow(destination);
  }));
});
