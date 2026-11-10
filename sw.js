// Offline cache. Bump VERSION whenever app files change so phones pick up the update.
const VERSION = "gym-v11";
const FILES = ["./", "index.html", "styles.css", "program.js", "quests.js", "session.js", "app.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates show up right away. With no signal, or a signal too weak to answer
// within 3 seconds (common in a gym), use the copy saved on the phone instead of waiting.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    // no-cache: always ask the server if a file changed, so updates are not hidden by the browser cache.
    const net = fetch(e.request, { cache: "no-cache" }).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    });
    if (!cached) return net;
    net.catch(() => {}); // a late failure after the cached copy was used is fine
    const slow = new Promise(resolve => setTimeout(() => resolve(null), 3000));
    try {
      return (await Promise.race([net, slow])) || cached;
    } catch {
      return cached;
    }
  })());
});
