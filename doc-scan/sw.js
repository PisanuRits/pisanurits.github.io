/* Doc Scan service worker — offline after first visit */
const VERSION = '1.2.0';
const CACHE = 'doc-scan-' + VERSION;
const SHELL = ['./', 'index.html', 'app.js', 'worker.js', 'cvproc.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'vendor/jspdf.umd.min.js'];
const BIG = ['vendor/opencv.js']; // large, rarely changes: cache-first

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.concat(BIG))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => {
    if (k.startsWith('doc-scan-') && k !== CACHE) return caches.delete(k);
    return null;
  }))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Google Fonts: cache-first, opaque responses allowed
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/vendor/opencv.js')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })));
    return;
  }
  // app shell: network-first so updates land, cache when offline
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return r;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});
