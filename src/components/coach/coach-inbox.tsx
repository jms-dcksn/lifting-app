"use client";
import { IconButton } from "@/components/ui/icon-button";
import { IconSettings } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  clearInboxHistory,
  moreNotices,
  refreshInbox,
  savePreferences,
} from "@/app/(app)/coach/inbox/actions";
import type { InboxPage } from "@/lib/coach-inbox-data";
import {
  DEFAULT_COACH_PREFERENCES,
  type CoachPreferences,
} from "@/lib/coach-episodes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { InfoButton } from "@/components/ui/info-button";

export function CoachInbox() {
  const [page, setPage] = useState<InboxPage | null>(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [clear, setClear] = useState(false);
  const [pending, start] = useTransition();
  const load = useCallback(
    () =>
      refreshInbox().then(
        (result) => {
          setPage(result.page);
          setStatus(result.refresh.status);
        },
        () => {
          setError("Unable to load Coach. Please retry.");
          setStatus("unavailable");
        },
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  function run(action: () => Promise<void>) {
    start(async () => {
      setError(null);
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Please retry.");
      }
    });
  }
  return (
    <div className="mx-auto w-full max-w-page space-y-5 px-4 pb-6">
      <PageHeader title="Coach inbox" actions={<>
        <InfoButton title="Coach inbox">
          <p>Only meaningful training exceptions appear here. Reading or acknowledging a notice never changes your training or ends a pain review. Refresh runs while you use the app; notifications are not delivered while it is closed.</p>
        </InfoButton>
        <IconButton variant="ghost" aria-label="Coach preferences" title="Coach preferences" onClick={() => setSettings(true)} disabled={!page}><IconSettings /></IconButton>
      </>} />

      {status === "loading" ? <p role="status">Loading…</p> : null}
      {status === "disabled" ? <p>Coach inbox is not available yet.</p> : null}
      {status === "unavailable" ||
      status === "refresh_required" ||
      page?.stale ? (
        <div role="status" className="flex items-center gap-3">
          <p>Coach refresh needed.</p>
          <Button
            variant="secondary"
            pending={pending}
            onClick={() => run(load)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      {page?.notices.length === 0 ? (
        <Card>
          <p>No Coach notices.</p>
        </Card>
      ) : null}
      <div className="space-y-3">
        {page?.notices.map((notice) => (
          <Link
            key={notice.id}
            href={`/coach/inbox/${notice.id}`}
            className="block rounded-card border border-border p-4 focus-visible:outline-2"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{notice.title}</h2>
              {!notice.read_at ? (
                <span className="text-caption font-semibold">Unread</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">{notice.body}</p>
            <p className="mt-2 text-caption text-faint">
              {new Date(notice.created_at).toLocaleDateString()}
              {notice.acknowledged_at ? " · Acknowledged" : ""}
            </p>
          </Link>
        ))}
      </div>
      {page?.nextCursor ? (
        <Button
          variant="secondary"
          pending={pending}
          onClick={() =>
            run(async () => {
              const next = await moreNotices(page.nextCursor!);
              setPage({ ...next, notices: [...page.notices, ...next.notices] });
            })
          }
        >
          More notices
        </Button>
      ) : null}
      {settings && page ? (
        <Sheet onClose={() => setSettings(false)} ariaLabel="Coach preferences">
          <CoachPreferenceForm
            initial={page.preferences}
            pending={pending}
            onSave={(preferences) =>
              run(async () => {
                await savePreferences(preferences, page.preferencesVersion);
                setSettings(false);
                await load();
                window.dispatchEvent(new Event("coach:refresh"));
              })
            }
          />
          <Button
            variant="ghost"
            className="mx-4 mb-6"
            onClick={() => {
              setSettings(false);
              setClear(true);
            }}
          >
            Clear Coach history
          </Button>
        </Sheet>
      ) : null}
      {clear ? (
        <Sheet onClose={() => setClear(false)} ariaLabel="Clear Coach history">
          <div className="px-4 pb-6">
            <h2 className="text-xl font-semibold">Clear Coach history?</h2>
            <p className="my-4">
              This removes inbox notices and episode history. Training logs,
              adaptations and chat transcripts stay saved. Current situations
              may return quietly.
            </p>
            <Button
              pending={pending}
              onClick={() =>
                run(async () => {
                  await clearInboxHistory(true);
                  setClear(false);
                  await load();
                  window.dispatchEvent(new Event("coach:refresh"));
                })
              }
            >
              Clear history
            </Button>
            <Button variant="ghost" onClick={() => setClear(false)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
function timeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
export function CoachPreferenceForm({
  initial = DEFAULT_COACH_PREFERENCES,
  pending,
  onSave,
}: {
  initial?: CoachPreferences;
  pending: boolean;
  onSave: (p: CoachPreferences) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      className="space-y-4 px-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <h2 className="text-xl font-semibold">Coach preferences</h2>
      {(
        [
          ["pain", "Significant pain"],
          ["reduction", "Repeated effort / rep-floor misses"],
          ["plateau", "Plateaus"],
          ["decline", "Sustained decline"],
          ["quietEnabled", "Quiet hours"],
        ] as const
      ).map(([key, label]) => (
        <label
          key={key}
          className="flex min-h-11 items-center justify-between gap-4"
        >
          <span>{label}</span>
          <input
            type="checkbox"
            checked={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
          />
        </label>
      ))}
      {draft.quietEnabled ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label>
              From
              <Input
                type="time"
                required
                value={timeValue(draft.quietStart)}
                onChange={(e) =>
                  setDraft({ ...draft, quietStart: minutes(e.target.value) })
                }
              />
            </label>
            <label>
              Until
              <Input
                type="time"
                required
                value={timeValue(draft.quietEnd)}
                onChange={(e) =>
                  setDraft({ ...draft, quietEnd: minutes(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="block">
            Timezone
            <Input
              required
              value={draft.timeZone}
              onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}
            />
          </label>
        </>
      ) : null}
      <Button type="submit" pending={pending}>
        Save preferences
      </Button>
    </form>
  );
}
