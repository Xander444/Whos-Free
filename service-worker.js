/* Bump this version and the HTML asset queries together for each release. */
const CACHE_NAME = "whos-free-shell-v10.1";
const APP_SHELL = ["./", "./index.html", "./styles.css?v=10.1", "./schedule-core.js?v=10.1", "./local-store.js?v=10.1", "./app.js?v=10.1", "./schedule-parser.js?v=10.1", "./manifest.webmanifest", "./assets/favicon.png", "./assets/apple-touch-icon.png", "./assets/icon-192.png", "./assets/icon-512.png"];
const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); });
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("whos-free-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) { try { await cache.put("./index.html", response.clone()); } catch { /* A full cache must not hide a valid network response. */ } return response; }
        return (await cache.match("./index.html")) || response;
      } catch { return (await cache.match("./index.html")) || Response.error(); }
    })());
    return;
  }
  // HTML is never substituted for a missing JavaScript, stylesheet or image.
  if (SHELL_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME), cached = await cache.match(request);
      if (cached) return cached;
      try { const response = await fetch(request); if (response.ok) { try { await cache.put(request, response.clone()); } catch { /* Caching is best effort. */ } } return response; }
      catch { return Response.error(); }
    })());
  }
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("./", self.registration.scope).href;
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = windows.find(client => client.url.startsWith(self.registration.scope));
    if (app) return app.focus();
    return clients.openWindow?.(url);
  })());
});
