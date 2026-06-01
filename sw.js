// ─── sw.js — CymorTune Service Worker ────────────────────────────────────────
const CACHE_NAME    = 'cymortune-v1';
const OFFLINE_PAGE  = '/';

// Files to cache on install (app shell)
const SHELL_FILES = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/search.js',
  '/js/downloader.js',
  '/js/history.js',
  '/js/sw-register.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800;900&family=Outfit:wght@300;400;500;600&display=swap',
];

// ── Install — cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(SHELL_FILES.map(url => new Request(url, { mode: 'no-cors' })));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate — clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => { console.log('[SW] Deleting old cache:', key); return caches.delete(key); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch — network-first for API, cache-first for assets ─────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go to network for API calls and downloads
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline. Please check your connection.' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, images, fonts)
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/')  ||
    url.pathname.startsWith('/icons/') ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML pages
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match(OFFLINE_PAGE))
      )
  );
});

// ── Push notifications (future use) ───────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'CymorTune', {
      body:  data.body  || 'Your download is ready!',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })
  );
});
