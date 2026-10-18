// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoachNoticeDetail } from "@/components/coach/coach-notice-detail";
import { coachEvidence, coachObservation } from "./testing/coach-fixtures";
import { DEFAULT_COACH_PREFERENCES, planCoachEpisodes } from "./coach-episodes";
import type { CoachActionIntent } from "./coach-intervention";
const actions = vi.hoisted(() => ({ episodeReview: vi.fn(), discussEpisode: vi.fn(), confirmEpisode: vi.fn(), openNotice: vi.fn(), markNotice: vi.fn(), push: vi.fn() }));
vi.mock("@/app/(app)/coach/episodes/actions", () => actions);
vi.mock("@/app/(app)/coach/inbox/actions", () => ({ ...actions, endPainReview: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: actions.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
let root: Root, host: HTMLDivElement;
const episode = planCoachEpisodes({ previous: [], observations: [coachObservation(coachEvidence("plateau"))], preferences: DEFAULT_COACH_PREFERENCES }).episodes[0];
const review = { episodeId: "episode", episode, fresh: true, sessionId: null, threadId: null, receipts: [], suggestion: { action: "rep_change", repBand: { repMin: 12, repMax: 15 }, ladderStep: 0 } };
const receipt = (intent: CoachActionIntent) => ({ ...intent, status: "applied", adaptationId: "adaptation", slotId: "slot", repMin: 12, repMax: 15 });
const button = (text: string) => [...host.querySelectorAll("button")].find(b => b.textContent === text)!;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  actions.openNotice.mockResolvedValue({ notice: { title: "Bench plateau review", generation_evidence: null }, episodeId: "episode", episode, fresh: true });
  actions.episodeReview.mockResolvedValue(review);
  actions.discussEpisode.mockResolvedValue("thread");
  actions.confirmEpisode.mockImplementation(async intent => receipt(intent));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("puts a scoped recommendation and direct acceptance on the notice without starting chat", async () => {
  await act(async () => root.render(<CoachNoticeDetail noticeId="notice" />));
  expect(host.textContent).toContain("Switch rep range to 12–15 reps");
  expect(host.textContent).toContain("remainder of the program");
  expect(actions.confirmEpisode).not.toHaveBeenCalled(); expect(actions.discussEpisode).not.toHaveBeenCalled();
  await act(async () => button("Accept change").click());
  expect(actions.confirmEpisode).toHaveBeenCalledOnce();
  expect(actions.confirmEpisode.mock.calls[0][0]).toMatchObject({ action: "rep_change", episodeId: "episode", scope: "program", sessionId: null });
  expect(host.querySelector("dialog")).toBeNull();
  expect(host.textContent).toContain("Applied: 12–15 reps");
});
it("retries a lost acceptance response with the original request identity", async () => {
  actions.confirmEpisode.mockRejectedValueOnce(Error("Connection lost"));
  await act(async () => root.render(<CoachNoticeDetail noticeId="notice" />));
  await act(async () => button("Accept change").click());
  expect(button("Accept change").disabled).toBe(true);
  await act(async () => button("Retry accepted change").click());
  expect(actions.confirmEpisode.mock.calls[1][0]).toEqual(actions.confirmEpisode.mock.calls[0][0]);
  expect(host.textContent).toContain("Applied: 12–15 reps");
});
it("Discuss explicitly requests a response on the reused contextual thread", async () => {
  await act(async () => root.render(<CoachNoticeDetail noticeId="notice" />));
  await act(async () => button("Discuss with Coach").click());
  expect(actions.discussEpisode).toHaveBeenCalledWith("episode");
  expect(actions.push).toHaveBeenCalledWith("/coach?thread=thread&discuss=1");
  expect(actions.confirmEpisode).not.toHaveBeenCalled();
});
