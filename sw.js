// Projects hub service worker (phone): keeps the app itself available offline. Data never goes through this
// cache; GitHub API calls pass straight through, and the app keeps its own snapshot of the data.
const VERSION = 'hub-cf6efacd00'
const SHELL = [
  './',
  './actions.js',
  './app.js',
  './core.js',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './index.html',
  './manifest.webmanifest',
  './markdown.js',
  './parts.js',
  './routes.js',
  './seen.js',
  './source.js',
  './state.js',
  './style.css',
  './view-ask.js',
  './view-forms.js',
  './view-list.js',
  './view-record.js',
  './view-setup.js',
  './view-share.js',
  './view-usage.js'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

const dropOldCaches = () => caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))

self.addEventListener('activate', event => {
  event.waitUntil(dropOldCaches().then(() => self.clients.claim()))
})

// An outgoing worker can still be saving into its own cache while this one activates, which recreates that
// cache; so clean up again once, on this worker's first request, when the old one has gone.
let isTidied = false

// Network first, so a new version shows up whenever there's a connection; the cached copy when there isn't.
// 'no-cache' revalidates with the server each time (GitHub Pages otherwise lets browsers reuse files for 10
// minutes, which would delay updates). A shared link opens the app with a query string, so cached pages
// match ignoring it.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (!isTidied) {
    isTidied = true
    event.waitUntil(dropOldCaches())
  }
  event.respondWith(
    fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
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
