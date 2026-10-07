/**
 * @file Service worker that keeps the site fresh after a deploy.
 *
 * GitHub Pages serves everything with `Cache-Control: max-age=600`, and a
 * normal reload only revalidates the page itself, so for up to 10 minutes
 * after a deploy the browser can mix new HTML with stale CSS, modules and
 * images. This worker asks the server about every same-origin subresource
 * (`cache: 'no-cache'`). Unchanged files come back as a cheap 304.
 *
 * It caches nothing and never touches the user's images: those are decoded
 * from local files and never requested over the network.
 *
 * It lives in the repo root so its scope covers every page.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Navigations are already revalidated by the browser (and can't be
  // re-created with new options); leave other origins and methods alone.
  if (req.method !== 'GET' || req.mode === 'navigate') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req, { cache: 'no-cache' }));
});
