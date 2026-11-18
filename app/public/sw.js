/* Stockify Pro offline shell for the Add-to-Home-Screen (PWA) install.
   Only same-origin files are cached; live quote feeds are always fetched live. */
const CACHE = "stockify-pro-v1";
const BASE = self.registration.scope;
const CORE = ["./", "./index.html", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest", "./data/market.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all(CORE.map((u) => caches.open(CACHE).then((c) => c.add(new URL(u, BASE).toString())).catch(() => null)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(new URL("./index.html", BASE).toString(), copy));
          return res;
        })
        .catch(() => caches.match(new URL("./index.html", BASE).toString()).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
