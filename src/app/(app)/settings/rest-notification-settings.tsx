"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoButton } from "@/components/ui/info-button";
import {
  currentRestNotificationPermission,
  ensureRestNotificationPermission,
  registerRestNotificationWorker,
  restNotificationControl,
  type RestNotificationPermission,
} from "@/lib/rest-notification";

export function RestNotificationSettings() {
  const [permission, setPermission] = useState<RestNotificationPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | undefined;
    const apply = () => {
      if (!cancelled) setPermission(currentRestNotificationPermission());
    };

    void registerRestNotificationWorker();
    void Promise.resolve().then(apply);

    const permissions = navigator.permissions;
    if (permissions?.query) {
      void permissions
        .query({ name: "notifications" })
        .then((next) => {
          if (cancelled) return;
          status = next;
          apply();
          next.addEventListener("change", apply);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      status?.removeEventListener("change", apply);
    };
  }, []);

  const control = permission ? restNotificationControl(permission) : null;

  async function enable() {
    await registerRestNotificationWorker();
    setPermission(await ensureRestNotificationPermission());
  }

  return (
    <div className="flex min-h-11 items-center gap-1">
      {control ? <span className="text-body">{control.status}</span> : null}
      {control?.action === "enable" ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => void enable()}>
          {control.actionLabel}
        </Button>
      ) : null}
      <InfoButton title="Rest complete notifications">
        A system banner fires when rest ends, including in the background when the browser
        allows it. Enable here or when you start a rest. If blocked, allow this site in
        browser settings. iPhone needs the Home Screen app. Lock screen is not guaranteed.
      </InfoButton>
    </div>
  );
}
