// Keeps the replay working offline: the page and its scripts are kept after the first visit. It only
// ever stores this site's own files; recordings and the game cache are read from your folders, never here.
const CACHE = "encounter-replay-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // The page itself: the newest when online, the kept copy when not
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((r) => keep(e.request, r)).catch(() => caches.match(e.request).then((r) => r ?? caches.match("./"))));
    return;
  }
  // Scripts and styles have their content's hash in their names, so a kept copy is always right
  e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((r) => keep(e.request, r))));
});

function keep(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
}
