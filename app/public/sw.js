const CACHE_NAME = 'radiostream-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Instalación: cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
    // NO usamos clients.claim() — evita tomar control de páginas activas
    // y cortarles el audio. El SW toma control en la próxima carga de página.
  );
});

// Fetch: estrategia stale-while-revalidate para assets, network-first para API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar http/https — ignorar chrome-extension://, data:, blob:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // No interceptar requests del servidor de desarrollo de Vite (HMR, módulos, source files)
  // Evita que el SW sirva versiones cacheadas de módulos y rompa el hot-reload
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.includes('__vite') ||
    url.pathname.includes('?t=') ||
    url.searchParams.has('t')
  ) return;

  // No interceptar rutas del backend admin (contienen auth, pueden ser POST/PUT/DELETE)
  if (url.pathname.startsWith('/admin-api/')) return;

  // No interceptar requests de streaming de audio ni WebSocket
  if (
    request.headers.get('Accept')?.includes('audio') ||
    url.pathname.includes('/listen/') ||
    url.pathname.includes('/radio/') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  // API de AzuraCast: network-first, solo cachear GET exitosos
  if (url.pathname.includes('/api/')) {
    // No cachear POST/PUT/DELETE — cache solo acepta GET
    if (request.method !== 'GET') return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          // cache.put() solo acepta GET — ignorar otros métodos
          if (networkResponse.ok && request.method === 'GET') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => cached ?? Response.error());

      return cached || fetchPromise;
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: data.tag || 'default',
    requireInteraction: true,
    actions: [
      {
        action: 'play',
        title: 'Reproducir',
        icon: '/icon-play.png',
      },
      {
        action: 'close',
        title: 'Cerrar',
        icon: '/icon-close.png',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'play') {
    event.waitUntil(
      self.clients.openWindow('/?action=play')
    );
  } else if (event.action === 'close') {
    // Solo cerrar
  } else {
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

// Sincronización en segundo plano
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-stats') {
    event.waitUntil(syncStats());
  }
});

async function syncStats() {
  // Sincronizar estadísticas cuando vuelva la conexión
  console.log('Syncing stats...');
}
