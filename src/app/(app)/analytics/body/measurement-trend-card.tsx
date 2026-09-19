"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoButton } from "@/components/ui/info-button";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import { writeMeasurements } from "@/app/(app)/measurements/actions";
import {
  SITES,
  SITE_META,
  measurementChartData,
  sitesWithPoints,
  type BodyMeasurement,
  type MeasurementChartPoint,
  type MeasurementSite,
} from "@/lib/body-measurements";
import { type WeightRange } from "@/lib/weight-trends";

const ranges: [WeightRange, string][] = [
  ["30", "30 days"],
  ["90", "90 days"],
  ["6m", "6 months"],
  ["all", "All history"],
];

const inches = (value: number | undefined) => (value == null ? "—" : `${value.toFixed(2)} in`);
const label = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

function emptyFields(): Record<MeasurementSite, string> {
  return { waist: "", neck: "", arm: "", thigh: "", chest: "" };
}

function fieldsForDate(entries: BodyMeasurement[], date: string): Record<MeasurementSite, string> {
  const next = emptyFields();
  for (const entry of entries) {
    if (entry.loggedOn === date) next[entry.site] = String(entry.inches);
  }
  return next;
}

export function MeasurementTrendCard({
  entries,
  today,
}: {
  entries: BodyMeasurement[];
  today: string;
}) {
  const [range, setRange] = useState<WeightRange>("90");
  const [visible, setVisible] = useState(() => new Set(sitesWithPoints(entries)));
  const [logOpen, setLogOpen] = useState(false);
  const data = useMemo(() => measurementChartData(entries, today, range), [entries, today, range]);
  const plotted = SITES.filter((site) => visible.has(site) && data.some((point) => point[site] != null));

  function toggle(site: MeasurementSite) {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(site)) next.delete(site);
      else next.add(site);
      return next;
    });
  }

  return (
    <Card className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-2">
        <CardLabel>Tape</CardLabel>
        <Button variant="secondary" size="sm" onClick={() => setLogOpen(true)}>
          Log tape
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Tape sites">
        {SITES.map((site) => (
          <Button
            key={site}
            type="button"
            variant={visible.has(site) ? "primary" : "secondary"}
            size="sm"
            className="min-h-11 px-2"
            aria-pressed={visible.has(site)}
            onClick={() => toggle(site)}
          >
            {SITE_META[site].label}
          </Button>
        ))}
      </div>
      <div className="my-4 grid grid-cols-4 gap-1" role="group" aria-label="Tape history range">
        {ranges.map(([value, text]) => (
          <Button
            key={value}
            variant={range === value ? "primary" : "secondary"}
            size="sm"
            className="min-h-11 px-1"
            aria-pressed={range === value}
            onClick={() => setRange(value)}
          >
            {text}
          </Button>
        ))}
      </div>
      {plotted.length > 0 ? (
        <>
          <div className="mb-2 flex items-center gap-1">
            <InfoButton title="Tape chart" label="About tape chart">
              Each line is one site in inches. Chips show or hide a series. Empty fields on save are left unchanged.
            </InfoButton>
          </div>
          <div
            className="h-64 min-w-0 w-full"
            role="group"
            aria-label="Tape measurements in inches over time."
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{ width: 0, height: 256 }}
            >
              <LineChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: -12 }} accessibilityLayer>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={[data[0].timestamp, data[data.length - 1].timestamp]}
                  scale="time"
                  tickCount={3}
                  tickFormatter={(value) =>
                    new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(value))
                  }
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  width={54}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  tickLine={false}
                  tickFormatter={(value) => Number(value).toFixed(1)}
                />
                <Tooltip content={<TapeTooltip visible={visible} />} />
                {plotted.map((site) => (
                  <Line
                    key={site}
                    dataKey={site}
                    type="linear"
                    stroke={SITE_META[site].stroke}
                    strokeDasharray={SITE_META[site].dash}
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={{ r: 4, fill: SITE_META[site].stroke, stroke: "var(--background)" }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="py-4 text-body text-muted">
          {entries.length
            ? "No readings in this range. Choose a longer range or log tape."
            : "Tape logs appear after the first save."}
        </p>
      )}
      {logOpen && (
        <Sheet onClose={() => setLogOpen(false)} ariaLabel="Log tape">
          <LogTapeSheet
            today={today}
            entries={entries}
            onSaved={(sites) => {
              setVisible((current) => {
                const next = new Set(current);
                for (const site of sites) next.add(site);
                return next;
              });
              setLogOpen(false);
            }}
          />
        </Sheet>
      )}
    </Card>
  );
}

function LogTapeSheet({
  today,
  entries,
  onSaved,
}: {
  today: string;
  entries: BodyMeasurement[];
  onSaved: (sites: MeasurementSite[]) => void;
}) {
  const dismiss = useSheetDismiss();
  const router = useRouter();
  const [loggedOn, setLoggedOn] = useState(today);
  const [fields, setFields] = useState(() => fieldsForDate(entries, today));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function changeDate(next: string) {
    setLoggedOn(next);
    setFields(fieldsForDate(entries, next));
    setError(null);
  }

  async function save() {
    const readings = SITES.flatMap((site) => {
      const raw = fields[site].trim();
      return raw === "" ? [] : [{ site, inches: Number(raw) }];
    });
    setPending(true);
    setError(null);
    try {
      const result = await writeMeasurements({ loggedOn, readings });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved(readings.map((reading) => reading.site));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="text-heading">Log tape</h2>
      <label className="flex min-w-0 flex-col gap-1 text-caption text-muted">
        Date
        <Input
          type="date"
          value={loggedOn}
          max={today}
          min="0001-01-01"
          required
          disabled={pending}
          onChange={(event) => changeDate(event.target.value)}
        />
      </label>
      {SITES.map((site) => (
        <label key={site} className="flex min-w-0 flex-col gap-1 text-caption text-muted">
          {SITE_META[site].label} (in)
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            max="80"
            value={fields[site]}
            disabled={pending}
            placeholder="Optional"
            onChange={(event) => {
              setFields((current) => ({ ...current, [site]: event.target.value }));
              setError(null);
            }}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending} size="lg">
        Save
      </Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={dismiss}>
        Cancel
      </Button>
    </form>
  );
}

function TapeTooltip({
  active,
  payload,
  visible,
}: {
  active?: boolean;
  payload?: readonly { payload?: MeasurementChartPoint }[];
  visible: Set<MeasurementSite>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="max-w-60 rounded-control border border-border bg-background p-3 text-caption shadow-sm">
      <p className="font-semibold">{label(point.date)}</p>
      {SITES.filter((site) => visible.has(site)).map((site) => (
        <p key={site}>
          {SITE_META[site].label}: {inches(point[site])}
        </p>
      ))}
    </div>
  );
}
