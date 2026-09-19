"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatReviewE1rm } from "@/lib/exercise-review-sessions";

export interface ChartPoint {
  date: string;
  dateKey: string;
  e1rm: number;
}

const PERIOD_FILL = "hsl(280 65% 60% / 0.15)";

export function E1rmChart({
  data,
  periodDates = [],
}: {
  data: ChartPoint[];
  periodDates?: string[];
}) {
  const periodSet = new Set(periodDates);
  const periodPoints = data.filter((point) => periodSet.has(point.dateKey));

  return (
    <div className="h-56 min-w-0 w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 0, height: 224 }}
      >
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => Number(value).toFixed(1)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={<E1rmTooltip periodDates={periodDates} />}
          />
          {periodPoints.map((point) => (
            <ReferenceArea
              key={`${point.dateKey}-${point.date}`}
              x1={point.date}
              x2={point.date}
              fill={PERIOD_FILL}
              fillOpacity={1}
              ifOverflow="extendDomain"
            />
          ))}
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke="currentColor"
            strokeWidth={2}
            dot={{ r: 2, fill: "currentColor" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function E1rmTooltip({
  active,
  payload,
  periodDates,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartPoint }[];
  periodDates?: string[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const isPeriodDay = periodDates?.includes(point.dateKey) ?? false;
  return (
    <div className="max-w-60 rounded-control border border-border bg-background p-3 text-caption shadow-sm">
      <p className="font-semibold">{point.date}</p>
      <p>{formatReviewE1rm(point.e1rm)} e1RM</p>
      {isPeriodDay && (
        <p className="mt-1 font-semibold" style={{ color: "hsl(280 65% 60%)" }}>
          Period
        </p>
      )}
    </div>
  );
}
