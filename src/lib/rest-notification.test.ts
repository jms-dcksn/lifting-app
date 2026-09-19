import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureRestNotificationPermission,
  readRestNotificationPermission,
  restNotificationControl,
  shouldAskRestNotificationPermission,
} from "./rest-notification";

describe("readRestNotificationPermission", () => {
  it("is unsupported when Notification is missing", () => {
    expect(readRestNotificationPermission(undefined)).toBe("unsupported");
  });

  it("returns the browser permission when Notification exists", () => {
    expect(readRestNotificationPermission({ permission: "default" })).toBe("default");
    expect(readRestNotificationPermission({ permission: "granted" })).toBe("granted");
    expect(readRestNotificationPermission({ permission: "denied" })).toBe("denied");
  });
});

describe("shouldAskRestNotificationPermission", () => {
  it("asks only while the browser has not decided", () => {
    expect(shouldAskRestNotificationPermission("default")).toBe(true);
    expect(shouldAskRestNotificationPermission("granted")).toBe(false);
    expect(shouldAskRestNotificationPermission("denied")).toBe(false);
    expect(shouldAskRestNotificationPermission("unsupported")).toBe(false);
  });
});

describe("restNotificationControl", () => {
  it("offers Enable while permission is undecided", () => {
    expect(restNotificationControl("default")).toEqual({
      status: "Rest notifications off",
      action: "enable",
      actionLabel: "Enable",
    });
  });

  it("shows on after the browser grants permission", () => {
    expect(restNotificationControl("granted")).toEqual({
      status: "Rest notifications on",
      action: "none",
    });
  });

  it("shows blocked after the browser denies permission", () => {
    expect(restNotificationControl("denied")).toEqual({
      status: "Rest notifications blocked",
      action: "none",
    });
  });

  it("shows unavailable when the API is missing", () => {
    expect(restNotificationControl("unsupported")).toEqual({
      status: "Rest notifications unavailable",
      action: "none",
    });
  });
});

describe("ensureRestNotificationPermission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests permission only while the browser has not decided", async () => {
    const requestPermission = vi.fn(async () => "granted" as const);
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    await expect(ensureRestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("does not prompt again after a grant or deny", async () => {
    const requestPermission = vi.fn(async () => "granted" as const);
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    await expect(ensureRestNotificationPermission()).resolves.toBe("granted");

    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    await expect(ensureRestNotificationPermission()).resolves.toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
