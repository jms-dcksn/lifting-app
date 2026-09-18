import { showRestCompleteNotification } from "./rest-notification";

// Format a rest countdown as m:ss (e.g. 120 -> "2:00", 47 -> "0:47"). Negatives clamp to 0.
export function formatRestRemaining(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Settings checkbox: present `on` means enabled. Unchecked boxes are omitted from FormData. */
export function parseRestToneEnabled(value: FormDataEntryValue | null): boolean {
  return value === "on";
}

export function notifyRestDone(toneEnabled = true) {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // no-op
  }
  showRestCompleteNotification();
  if (!toneEnabled) return;
  playRestCompleteTone();
}

// Two short 880Hz beeps. Autoplay without a recent gesture may still no-op.
function playRestCompleteTone() {
  try {
    const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Ctx = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume();
    const now = ctx.currentTime;
    beep(ctx, now, 0.16);
    beep(ctx, now + 0.22, 0.18);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // no-op
  }
}

function beep(ctx: AudioContext, start: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.14, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}
