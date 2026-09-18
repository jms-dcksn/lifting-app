import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRestRemaining, notifyRestDone, parseRestToneEnabled } from "./rest";

describe("formatRestRemaining", () => {
  it("formats whole minutes", () => {
    expect(formatRestRemaining(120)).toBe("2:00");
  });
  it("zero-pads seconds under a minute", () => {
    expect(formatRestRemaining(47)).toBe("0:47");
  });
  it("formats minutes + seconds", () => {
    expect(formatRestRemaining(107)).toBe("1:47");
  });
  it("rounds fractional seconds", () => {
    expect(formatRestRemaining(59.6)).toBe("1:00");
  });
  it("clamps negatives to 0:00", () => {
    expect(formatRestRemaining(-5)).toBe("0:00");
  });
});

describe("parseRestToneEnabled", () => {
  it("treats the Settings checkbox on value as enabled", () => {
    expect(parseRestToneEnabled("on")).toBe(true);
  });
  it("treats a missing checkbox as off", () => {
    expect(parseRestToneEnabled(null)).toBe(false);
    expect(parseRestToneEnabled("off")).toBe(false);
  });
});

describe("notifyRestDone", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("vibrates even when the tone is off, and does not construct AudioContext", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const AudioContext = vi.fn();
    vi.stubGlobal("AudioContext", AudioContext);
    notifyRestDone(false);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(AudioContext).not.toHaveBeenCalled();
  });

  it("attempts in-app Web Audio when the tone is on", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const AudioContext = vi.fn(() => {
      throw new Error("no audio in tests");
    });
    vi.stubGlobal("AudioContext", AudioContext);
    notifyRestDone(true);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(AudioContext).toHaveBeenCalledOnce();
  });

  it("shows a Rest over notification when permission is granted, even if tone is off", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const instances: { title: string; options?: NotificationOptions }[] = [];
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        instances.push({ title, options });
      }
    }
    vi.stubGlobal("Notification", MockNotification);
    notifyRestDone(false);
    expect(instances).toEqual([
      {
        title: "Rest over",
        options: { body: "Time for the next set", tag: "rest-complete", renotify: true },
      },
    ]);
  });

  it("skips the notification constructor when permission is denied", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const instances: { title: string }[] = [];
    class MockNotification {
      static permission = "denied";
      constructor(title: string) {
        instances.push({ title });
      }
    }
    vi.stubGlobal("Notification", MockNotification);
    notifyRestDone(true);
    expect(instances).toEqual([]);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
  });
});
