/* Service worker Business Banking — versi 2.0.0+fd805e9e
 * Aset statis: cache-first (instan). API Apps Script: SELALU jaringan (data nasabah tidak pernah di-cache SW). */
const CACHE = 'bb-fd805e9e';
const ASET = ['./', './index.html', './css/app.css?v=fd805e9e', './js/app.js?v=fd805e9e', './js/config.js', './verifikasi.html', './js/verifikasi.js', './manifest.json', './icon-192.png', './icon-512.png', './favicon-32.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASET)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                                    // POST API → langsung jaringan
  if (/script\.google(usercontent)?\.com$/.test(u.hostname) || u.hostname === 'accounts.google.com') return;
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).catch(() => caches.match('./index.html'))); return; }
  if (u.origin === location.origin && /\/config\.js$/.test(u.pathname)) { // config.js: jaringan dulu agar GAS_URL baru langsung terpakai
    e.respondWith(fetch(e.request).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return res; }).catch(() => caches.match(e.request))); return;
  }
  const runtime = /fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/.test(u.hostname);
  if (u.origin === location.origin || runtime) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && (u.origin === location.origin || runtime)) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); }
      return res;
    })));
  }
});
