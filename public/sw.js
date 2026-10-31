// AbhiNova service worker — deliberately minimal: it never caches app pages or
// API responses (chats are private and always fresh). Its only job is a
// friendly offline page when a page navigation fails with no connection.
const CACHE = "abhinova-offline-v1";
const OFFLINE_ASSETS = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  // The offline page's own icon.
  if (new URL(request.url).pathname === "/icons/icon-192.png") {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
