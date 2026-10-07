/**
 * @file Registers the root service worker (sw.js), which makes the browser
 * revalidate CSS, modules and images, so a deploy shows up on the next
 * reload instead of up to 10 minutes later. Imported by every page's entry.
 */

if ('serviceWorker' in navigator) {
  // Resolved from this module, so it works from the root and from subfolders.
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {
    // Not fatal: without it the site just follows normal HTTP caching.
  });
}
