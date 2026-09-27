// Service Worker for offline operations -- scoped to /sistema/ (the internal
// POS tool), registered from js/app.js. The public landing page at / is a
// plain static page and isn't part of this PWA/offline experience.
// Must match the ?v= query string used by sistema/index.html. The cache is keyed
// by the full request URL, so precaching '/js/app.js' while the page asks for
// '/js/app.js?v=NNN' (mismatched) would store two unrelated entries and never serve the
// precached one. Bump both together on every release.
const APP_VERSION = '__APP_VERSION__';
const CACHE_NAME = `casa-lucenzo-v${APP_VERSION}`;

// Every script sistema/index.html loads, in the same order, with the same ?v=.
const SCRIPTS = [
  'ui/shared.js',
  'storage.js',
  'supabase.js',
  'exchange-rate.js',
  'export.js',
  'auth.js',
  'sales.js',
  'analytics.js',
  'inventory.js',
  'pin-management.js',
  'recipes.js',
  'audio.js',
  'share.js',
  'agent.js',
  'ui.js',
  'app.js',
  'desktop.js'
].map(file => `/js/${file}?v=${APP_VERSION}`);

// Plan B: PowerSync's SQLite worker + WASM, vendored locally (js/powersync/
// vendor/, via `npx @powersync/web copy-assets`) because it can't be loaded
// cross-origin (see js/powersync/client.js). Fetched without a ?v= -- the
// worker's own internal imports reference these by their real relative
// paths, no query string involved. schema.js is imported by client.js the
// same way (no ?v= either). connector.js/client.js get one like every other
// same-origin script above.
const POWERSYNC_VENDORED = [
  '@powersync/AccessHandlePoolVFS-BPUHfZME.js',
  '@powersync/FacadeVFS-d1ZDvud7.js',
  '@powersync/IDBBatchAtomicVFS-DbkDb777.js',
  '@powersync/MemoryVFS-DVJL5F8j.js',
  '@powersync/OPFSCoopSyncVFS-BgTiWPfa.js',
  '@powersync/OPFSWriteAheadVFS-BW9pqSNn.js',
  '@powersync/assets/mc-wa-sqlite-BHScYYZw.wasm',
  '@powersync/assets/mc-wa-sqlite-async-DdlQmAUV.wasm',
  '@powersync/assets/wa-sqlite-CIxTmRHQ.wasm',
  '@powersync/assets/wa-sqlite-async-zc68fxQq.wasm',
  '@powersync/mc-wa-sqlite-PubB6u8c.js',
  '@powersync/mc-wa-sqlite-async-DJG_ANKO.js',
  '@powersync/wa-sqlite-D1_4mGs8.js',
  '@powersync/wa-sqlite-async-BxkwNY-2.js',
  '@powersync/websockets-Q8W_lerF.js',
  '@powersync/worker.js'
].map(file => `/js/powersync/vendor/${file}`);

const ASSETS_TO_CACHE = [
  '/sistema/',
  '/sistema/index.html',
  '/manifest.json',
  // main.css is requested with ?v=; the three files it @imports are not.
  `/css/main.css?v=${APP_VERSION}`,
  '/css/variables.css',
  '/css/layout.css',
  '/css/components.css',
  ...SCRIPTS,
  `/js/powersync/connector.js?v=${APP_VERSION}`,
  `/js/powersync/client.js?v=${APP_VERSION}`,
  '/js/powersync/schema.js',
  ...POWERSYNC_VENDORED,
  '/img/logo-192.png',
  '/img/logo-512.png'
];

// Install Event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching offline assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const cleanupPromises = cacheNames
        .filter(name => name !== CACHE_NAME)
        .map(name => {
          console.log('Clearing old cache:', name);
          return caches.delete(name);
        });
      return Promise.all(cleanupPromises);
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-While-Revalidate caching strategy
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // background fetch to update the cache (stale-while-revalidate)
          fetch(event.request)
            .then(networkResponse => {
              if (networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // Cache miss: request from network
        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/sistema/index.html');
            }
          });
      })
  );
});
