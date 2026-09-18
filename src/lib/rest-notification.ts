export const REST_SW_PATH = "/rest-sw.js";
export const REST_NOTIFICATION_TITLE = "Rest over";
export const REST_NOTIFICATION_BODY = "Time for the next set";
export const REST_NOTIFICATION_TAG = "rest-complete";

export type RestNotificationPermission = "unsupported" | NotificationPermission;

export type RestNotificationControl = {
  status: string;
  action: "enable" | "none";
  actionLabel?: "Enable";
};

export function readRestNotificationPermission(
  notificationCtor: { permission: NotificationPermission } | undefined,
): RestNotificationPermission {
  return notificationCtor ? notificationCtor.permission : "unsupported";
}

export function shouldAskRestNotificationPermission(
  permission: RestNotificationPermission,
): boolean {
  return permission === "default";
}

export function restNotificationControl(
  permission: RestNotificationPermission,
): RestNotificationControl {
  switch (permission) {
    case "unsupported":
      return { status: "Rest notifications unavailable", action: "none" };
    case "default":
      return { status: "Rest notifications off", action: "enable", actionLabel: "Enable" };
    case "granted":
      return { status: "Rest notifications on", action: "none" };
    case "denied":
      return { status: "Rest notifications blocked", action: "none" };
  }
}

type RestNotificationShowOptions = NotificationOptions & { renotify?: boolean };

export function restNotificationOptions(): RestNotificationShowOptions {
  return {
    body: REST_NOTIFICATION_BODY,
    tag: REST_NOTIFICATION_TAG,
    renotify: true,
  };
}

function notificationCtor(): typeof Notification | undefined {
  return typeof Notification === "undefined" ? undefined : Notification;
}

export function currentRestNotificationPermission(): RestNotificationPermission {
  return readRestNotificationPermission(notificationCtor());
}

export async function ensureRestNotificationPermission(): Promise<RestNotificationPermission> {
  const NotificationAPI = notificationCtor();
  if (!NotificationAPI) return "unsupported";
  if (!shouldAskRestNotificationPermission(NotificationAPI.permission)) {
    return NotificationAPI.permission;
  }
  try {
    return await NotificationAPI.requestPermission();
  } catch {
    return readRestNotificationPermission(NotificationAPI);
  }
}

let registration: ServiceWorkerRegistration | null = null;
let scheduleId = 0;

export async function registerRestNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    registration = await navigator.serviceWorker.register(REST_SW_PATH, { scope: "/" });
    return registration;
  } catch {
    return null;
  }
}

function postToRestWorker(message: { type: string; endsAt?: number; id?: number }) {
  const worker = registration?.active ?? navigator.serviceWorker?.controller ?? null;
  worker?.postMessage(message);
}

export async function scheduleRestNotification(endsAt: number): Promise<void> {
  if (currentRestNotificationPermission() !== "granted") return;
  if (!registration) await registerRestNotificationWorker();
  scheduleId += 1;
  postToRestWorker({ type: "schedule", endsAt, id: scheduleId });
}

export function cancelRestNotification(): void {
  if (scheduleId === 0) return;
  postToRestWorker({ type: "cancel", id: scheduleId });
}

export function showRestCompleteNotification(): void {
  if (currentRestNotificationPermission() !== "granted") return;
  const options = restNotificationOptions();
  if (registration) {
    void registration.showNotification(REST_NOTIFICATION_TITLE, options);
    return;
  }
  try {
    new Notification(REST_NOTIFICATION_TITLE, options);
  } catch {
    // no-op
  }
}
