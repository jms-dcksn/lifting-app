"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore } from "@/components/ui/icons";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";

type Panel = "menu" | "lifts" | "volume";

export function TrackExploreMenu({
  allLifts,
  volumeAndWeight,
}: {
  allLifts: React.ReactNode;
  volumeAndWeight: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");

  const close = () => {
    setOpen(false);
    setPanel("menu");
  };

  const titles: Record<Panel, string> = {
    menu: "Explore Track",
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
  onClose,
  onPanel,
}: {
  panel: Panel;
  allLifts: React.ReactNode;
  volumeAndWeight: React.ReactNode;
  onClose: () => void;
  onPanel: (panel: Panel) => void;
}) {
  const dismiss = useSheetDismiss();

  return (
    <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
      {panel === "menu" ? (
        <>
          <h2 className="text-heading">Explore</h2>
          <nav aria-label="Track views" className="flex flex-col divide-y divide-border">
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
          <h2 className="text-heading">{panel === "lifts" ? "All lifts" : "Volume & weight"}</h2>
          {panel === "lifts" ? allLifts : volumeAndWeight}
        </>
      )}
      <Button type="button" variant="ghost" onClick={dismiss}>
        Done
      </Button>
    </div>
  );
}
