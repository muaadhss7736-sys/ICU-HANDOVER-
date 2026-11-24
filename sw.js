const CACHE = 'ibn-sina-icu-v4';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'parser.js', 'pdf.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
const OCR = ['vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js', 'vendor/tesseract/tesseract-core.wasm.js',
  'vendor/tesseract/tesseract-core-simd.wasm.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/lang/eng.traineddata.gz'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE); await c.addAll(CORE);
    await Promise.all(OCR.map(u => c.add(u).catch(() => {}))); // optional OCR engine files
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  // Only old *app-shell caches* are removed. Patient data lives in IndexedDB and is never touched here.
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith('ibn-sina-icu-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res;
  }).catch(() => r.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
