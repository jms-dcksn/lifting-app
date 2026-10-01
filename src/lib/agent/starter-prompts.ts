/** Suggested first messages for an empty Coach thread. */
export const STARTER_PROMPTS = [
  "Build me a program",
  "How was my week?",
  "Open my coach check-in",
  "What's my next workout?",
  "Why is my next squat target what it is?",
] as const;

export type StarterPrompt = (typeof STARTER_PROMPTS)[number];

export function isStarterPrompt(value: string): value is StarterPrompt {
  return (STARTER_PROMPTS as readonly string[]).includes(value);
}
