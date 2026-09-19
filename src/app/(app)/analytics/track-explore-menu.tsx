"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore } from "@/components/ui/icons";
import { InfoButton } from "@/components/ui/info-button";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";

type Panel = "menu" | "weekPrs" | "lifts" | "volume";

export function TrackExploreMenu({
  allLifts,
  volumeAndWeight,
  weekPrs,
}: {
  allLifts: React.ReactNode;
  volumeAndWeight: React.ReactNode;
  weekPrs: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");

  const close = () => {
    setOpen(false);
    setPanel("menu");
  };

  const titles: Record<Panel, string> = {
    menu: "Explore Track",
    weekPrs: "This week's PRs",
    lifts: "All lifts",
    volume: "Volume & weight",
  };

  return (
    <>
      <IconButton variant="ghost" aria-label="Explore Track" onClick={() => setOpen(true)}>
        <IconMore />
      </IconButton>
      {open && (
        <Sheet ariaLabel={titles[panel]} onClose={close}>
          <TrackExploreBody
            panel={panel}
            allLifts={allLifts}
            volumeAndWeight={volumeAndWeight}
            weekPrs={weekPrs}
            onClose={close}
            onPanel={setPanel}
          />
        </Sheet>
      )}
    </>
  );
}

function TrackExploreBody({
  panel,
  allLifts,
  volumeAndWeight,
  weekPrs,
  onClose,
  onPanel,
}: {
  panel: Panel;
  allLifts: React.ReactNode;
  volumeAndWeight: React.ReactNode;
  weekPrs: React.ReactNode;
  onClose: () => void;
  onPanel: (panel: Panel) => void;
}) {
  const dismiss = useSheetDismiss();
  const titles: Record<Exclude<Panel, "menu">, string> = {
    weekPrs: "This week's PRs",
    lifts: "All lifts",
    volume: "Volume & weight",
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
      {panel === "menu" ? (
        <>
          <h2 className="text-heading">Explore</h2>
          <nav aria-label="Track views" className="flex flex-col divide-y divide-border">
            <button
              type="button"
              className="min-h-11 py-3 text-left text-body"
              onClick={() => onPanel("weekPrs")}
            >
              This week&apos;s PRs
            </button>
            <Link
              href="/analytics/month"
              className="min-h-11 py-3 text-body"
              onClick={onClose}
            >
              Month review
            </Link>
            <button
              type="button"
              className="min-h-11 py-3 text-left text-body"
              onClick={() => onPanel("lifts")}
            >
              All lifts
            </button>
            <button
              type="button"
              className="min-h-11 py-3 text-left text-body"
              onClick={() => onPanel("volume")}
            >
              Volume & weight
            </button>
          </nav>
        </>
      ) : (
        <>
          <button
            type="button"
            className="min-h-11 py-2 text-left text-body text-muted"
            onClick={() => onPanel("menu")}
          >
            ← Explore
          </button>
          <div className="flex items-center gap-1">
            <h2 className="text-heading">{titles[panel]}</h2>
            {panel === "weekPrs" ? (
              <InfoButton title="This week's PRs">
                Canonical records from the last seven local days.
              </InfoButton>
            ) : null}
          </div>
          {panel === "lifts" ? allLifts : panel === "volume" ? volumeAndWeight : weekPrs}
        </>
      )}
      <Button type="button" variant="ghost" onClick={dismiss}>
        Done
      </Button>
    </div>
  );
}
