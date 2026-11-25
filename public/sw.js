// Offline cache. Bump CACHE together with APP_VERSION in js/version.js when shipping changes.
// Every file the app loads must be in ASSETS, or it won't work offline.
const CACHE = 'watchlist-v26';
const ASSETS = ['./', 'index.html', 'styles.css', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icon.svg',
  'js/categories.js',
  'js/cloud.js',
  'js/facts.js',
  'js/fastscroll.js',
  'js/images.js',
  'js/fill.js',
  'js/library.js',
  'js/main.js',
  'js/router.js',
  'js/shows.js',
  'js/sources.js',
  'js/tagrules.js',
  'js/state.js',
  'js/tmdb.js',
  'js/ui.js',
  'js/util.js',
  'js/version.js',
  'js/watch.js',
  'js/wikidata.js',
  'js/views/account.js',
  'js/views/actors.js',
  'js/views/add.js',
  'js/views/browse.js',
  'js/views/deck.js',
  'js/views/fill.js',
  'js/views/link.js',
  'js/views/list.js',
  'js/views/show.js',
  'js/views/title.js',
  'js/views/statuses.js',
  'js/views/tags.js',
  'js/views/updates.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first so updates show up when online; cache as offline fallback.
// Only the app's own files are cached; Supabase, TMDB and the Netlify functions always go to the network.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (!res.ok) return res;
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
