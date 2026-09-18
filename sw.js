/* Truck Talk Admin — service worker.
 * Caches the static app shell so repeat visits load instantly. Firebase
 * SDK/API calls are explicitly left alone: they're either pinned CDN URLs
 * the browser already caches well on its own, or live calls that must
 * hit the network (auth, database reads/writes) — this dashboard's whole
 * purpose is live data, so it isn't meant to work fully offline.
 */
const CACHE_NAME = "tta-shell-v3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./admin.js",
  "./manifest.json",
  "./shared/tokens.css",
  "./shared/i18n.js",
  "./shared/theme.css",
  "./shared/firebase.js",
  "./shared/firebase-config.js",
  "./shared/auth-gate.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first: a fresh deploy shows up on the very next open. This
// dashboard is all live data, so the cache is only an offline fallback for
// the app shell.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Firebase, fonts, gstatic: the browser handles these
  if (url.pathname.startsWith("/__/")) return;        // Firebase auth handler proxy

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok){
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
