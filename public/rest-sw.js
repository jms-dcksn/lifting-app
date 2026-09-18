const TITLE = "Rest over";
const BODY = "Time for the next set";
const TAG = "rest-complete";

let timer = 0;
let currentId = 0;

function showRestNotification() {
  return self.registration.showNotification(TITLE, {
    body: BODY,
    tag: TAG,
    renotify: true,
    vibrate: [200, 100, 200],
  });
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "schedule" && typeof data.endsAt === "number" && typeof data.id === "number") {
    currentId = data.id;
    clearTimeout(timer);
    const delay = Math.max(0, data.endsAt - Date.now());
    timer = setTimeout(() => {
      if (currentId === data.id) void showRestNotification();
    }, delay);
    return;
  }

  if (data.type === "cancel") {
    if (typeof data.id !== "number" || data.id === currentId) {
      currentId = 0;
      clearTimeout(timer);
    }
    return;
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const session = windows.find((client) => client.url.includes("/session/"));
      const target = session ?? windows[0];
      if (target) return target.focus();
      return self.clients.openWindow("/");
    }),
  );
});
