/* ══════════════════════════════════════════════════════════════
   sw.js — Sâm Lốc · Service Worker (offline support)
══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'xamloc-v14';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './bridge.js',
    './luuthanhcong.mp3',
    './luuthatbai.mp3',
    './chart.js',
    './sound.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './logo.svg',
];

// Cài đặt: cache trước toàn bộ app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Kích hoạt: dọn cache phiên bản cũ
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: cache-first cho app shell (same-origin), network-first cho phần còn lại
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (isSameOrigin) {
        // Network-first: luôn lấy bản mới khi có mạng (sửa code xong là thấy ngay), rớt mạng thì dùng cache
        if (req.headers.has('range')) return; // để trình duyệt tự xử lý yêu cầu Range (mp3/video)
        event.respondWith(
            fetch(req).then((res) => {
                if (res && res.status === 200) { const clone = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)); }
                return res;
            }).catch(() => caches.match(req))
        );
    } else {
        // CDN/font: thử mạng trước, rớt mạng thì lấy cache (nếu có)
        event.respondWith(
            fetch(req).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                return res;
            }).catch(() => caches.match(req))
        );
    }
});