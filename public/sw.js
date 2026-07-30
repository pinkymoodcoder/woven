self.addEventListener("push", (event) => {
  const data = event.data?.json?.() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Woven", {
      body: data.body || "A small planning moment is ready.",
      tag: data.tag || "woven-planning",
      data: data.url || "/"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || "/"));
});
