"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  enablePeriodTracking,
  disablePeriodTracking,
  deletePeriodHistory,
} from "@/app/(app)/settings/actions";
import { Button } from "./ui/button";
import { Card, CardLabel } from "./ui/card";
import { Sheet } from "./ui/sheet";
import { LogPeriodButton } from "./period-calendar";

export function PeriodTrackingSettings({
  today,
  sex,
  trackingEnabled,
  hasObservations,
}: {
  today: string;
  sex: string;
  trackingEnabled: boolean;
  hasObservations: boolean;
}) {
  const [showConsent, setShowConsent] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  if (sex !== "female") {
    if (!hasObservations) return null;
    return (
      <Card className="flex flex-col gap-4">
        <div>
          <CardLabel className="mb-1">Manage hidden period data</CardLabel>
          <p className="text-body text-muted">
            Period tracking is unavailable for this profile. Recorded period days stay
            hidden until you select Female and re-enable tracking, or delete them.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete history permanently
        </Button>
        {showDeleteConfirm && (
          <DeleteHistoryModal
            onConfirm={handleDeleteHistory}
            onCancel={() => setShowDeleteConfirm(false)}
            pending={pending}
          />
        )}
      </Card>
    );
  }

  async function handleEnable() {
    setPending(true);
    try {
      await enablePeriodTracking();
      setShowConsent(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to enable period tracking");
    } finally {
      setPending(false);
    }
  }

  async function handleDisable(deleteHistory: boolean) {
    setPending(true);
    try {
      await disablePeriodTracking(deleteHistory);
      setShowDisable(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to disable period tracking");
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteHistory() {
    setPending(true);
    try {
      await deletePeriodHistory();
      setShowDeleteConfirm(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to delete period history");
    } finally {
      setPending(false);
    }
  }

  if (!trackingEnabled && !hasObservations) {
    return (
      <>
        <Card className="flex flex-col gap-4">
          <div>
            <CardLabel className="mb-1">Period tracking (optional)</CardLabel>
            <p className="text-body text-muted">
              Mark observed menstrual period days on a calendar. These appear as context
              bands on monthly weight and strength charts. No predictions, no training
              adjustments, no external sharing. Your period data stays private.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setShowConsent(true)}>
            Enable period tracking
          </Button>
        </Card>
        {showConsent && (
          <ConsentModal
            onConfirm={handleEnable}
            onCancel={() => setShowConsent(false)}
            pending={pending}
          />
        )}
      </>
    );
  }

  if (!trackingEnabled && hasObservations) {
    return (
      <Card className="flex flex-col gap-4">
        <div>
          <CardLabel className="mb-1">Period tracking (disabled)</CardLabel>
          <p className="text-body text-muted">
            Your period data is kept privately and hidden. You can re-enable tracking to
            see it again, or delete it permanently.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowConsent(true)}>
            Re-enable tracking
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete history permanently
          </Button>
        </div>
        {showConsent && (
          <ConsentModal
            onConfirm={handleEnable}
            onCancel={() => setShowConsent(false)}
            pending={pending}
          />
        )}
        {showDeleteConfirm && (
          <DeleteHistoryModal
            onConfirm={handleDeleteHistory}
            onCancel={() => setShowDeleteConfirm(false)}
            pending={pending}
          />
        )}
      </Card>
    );
  }

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div>
          <CardLabel className="mb-1">Period tracking</CardLabel>
          <p className="text-body text-muted">
            Mark period days and view them as context on monthly charts.
          </p>
        </div>
        <LogPeriodButton today={today} className="w-full" />
        <Button type="button" variant="secondary" onClick={() => setShowDisable(true)}>
          Disable tracking
        </Button>
      </Card>
      {showDisable && (
        <DisableModal
          onConfirm={handleDisable}
          onCancel={() => setShowDisable(false)}
          pending={pending}
        />
      )}
    </>
  );
}

function ConsentModal({
  onConfirm,
  onCancel,
  pending,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <Sheet onClose={onCancel} ariaLabel="Enable period tracking" dismissible={!pending}>
      <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
        <h2 className="text-heading">Enable period tracking?</h2>
        <div className="flex flex-col gap-3 text-body text-muted">
          <p>
            You can mark the days you observe menstrual bleeding on the calendar. These
            days appear as shaded bands on your monthly progress charts to provide
            context.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Blank days are not treated as confirmed absences.</li>
            <li>No cycle predictions or auto-adjustments to training.</li>
            <li>
              Your period data is private and not shared with external AI or Coach by
              default.
            </li>
            <li>You can disable tracking or delete history at any time.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? "Enabling…" : "Enable"}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function DisableModal({
  onConfirm,
  onCancel,
  pending,
}: {
  onConfirm: (deleteHistory: boolean) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <Sheet onClose={onCancel} ariaLabel="Disable period tracking" dismissible={!pending}>
      <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
        <h2 className="text-heading">Disable period tracking?</h2>
        <p className="text-body text-muted">
          Period days will no longer appear on charts. You can:
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => onConfirm(false)}
          >
            {pending ? "Disabling…" : "Keep history & disable"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(true)}
          >
            {pending ? "Deleting…" : "Delete history & disable"}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <div className="flex flex-col gap-2 text-caption text-muted">
          <p>
            <strong>Keep history (private):</strong> Your recorded period days stay in
            your account. Re-enabling tracking will show them again.
          </p>
          <p>
            <strong>Delete history permanently:</strong> Remove all recorded period days.
            This cannot be undone.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

function DeleteHistoryModal({
  onConfirm,
  onCancel,
  pending,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <Sheet
      onClose={onCancel}
      ariaLabel="Delete period history"
      dismissible={!pending}
    >
      <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
        <h2 className="text-heading">Delete period history?</h2>
        <p className="text-body text-muted">
          Permanently delete all recorded period days? This cannot be undone.
        </p>
        <div className="flex flex-col gap-2">
        <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
          {pending ? "Deleting…" : "Delete permanently"}
        </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
