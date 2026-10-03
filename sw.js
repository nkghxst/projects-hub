// Projects hub service worker (phone): keeps the app itself available offline. Data never goes through this
// cache; GitHub API calls pass straight through, and the app keeps its own snapshot of the data.
const VERSION = 'hub-097190678f'
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './core.js',
  './markdown.js',
  './source.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// Network first, so a new version shows up whenever there's a connection; the cached copy when there isn't.
// A shared link opens the app with a query string, so cached pages match ignoring it.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(VERSION).then(cache => cache.put(event.request, copy))
        }
        return response
      })
      .catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')),
      ),
  )
})
