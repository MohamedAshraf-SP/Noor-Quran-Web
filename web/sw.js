// Minimal service worker: lets the site show notifications (required on Android) and handle clicks.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data?.id || event.notification.tag;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients[0];
    if (client) {
      await client.focus();
      client.postMessage({ type: 'notifClick', id });
    } else {
      await self.clients.openWindow('./');
    }
  })());
});
