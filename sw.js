const CACHE_NAME = "nn-route-final-updates-v6";
const VENUE_IMAGE_CACHE = "nn-route-venue-images-v1";
const VENUE_IMAGE_CACHE_LIMIT = 100;
const APP_SHELL = [
  "./",
  "./index.html",
  "./venue-cards.css?v=5",
  "./venue-cards-data.js?v=6",
  "./venue-cards.js?v=5",
  "./data/weather.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![CACHE_NAME, VENUE_IMAGE_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function trimVenueImageCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - VENUE_IMAGE_CACHE_LIMIT;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/assets/venues/")) {
    event.respondWith(
      caches.open(VENUE_IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          await trimVenueImageCache(cache);
        }
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate" || url.pathname.endsWith("/data/weather.json")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
