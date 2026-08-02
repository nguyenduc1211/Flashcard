// Tên cache CỐ ĐỊNH — không cần đổi mỗi lần deploy, vì độ mới của nội dung
// đã được đảm bảo bằng chiến lược "network-first" bên dưới, không phải bằng
// việc đổi tên cache để buộc trình duyệt tải lại từ đầu.
const CACHE_NAME = "flashcard-n5-cache-v1";

// Các file "khung" của app, cache sẵn khi cài đặt để app chạy được ngay cả
// lần đầu mở khi offline (ít khi thay đổi -> cache-first là hợp lý).
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Những file LUÔN cần lấy bản mới nhất từ mạng khi có thể (network-first),
// vì đây là nội dung có thể thay đổi thường xuyên: index.html (code app) và
// version.json (dùng để tự kiểm tra phiên bản mới + hiển thị release notes).
const NETWORK_FIRST_FILES = ["index.html", "version.json"];

function isNetworkFirst(url) {
  return NETWORK_FIRST_FILES.some(name => url.pathname.endsWith(name)) ||
         url.pathname === "/" || url.pathname.endsWith("/");
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  // Chỉ can thiệp các request cùng origin (bỏ qua CDN ngoài, v.v.)
  if (url.origin !== self.location.origin) return;

  if (isNetworkFirst(url)) {
    // NETWORK-FIRST: luôn thử lấy bản mới nhất; nếu mất mạng thì mới dùng cache
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // CACHE-FIRST (kèm cập nhật ngầm): trả cache ngay cho nhanh, đồng thời
    // âm thầm tải bản mới về cache cho lần sau (stale-while-revalidate)
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
