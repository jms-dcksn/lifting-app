"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartPoint {
  date: string; // short label, e.g. "Jun 9"
  e1rm: number; // best working-set e1RM that session
}

// Monochrome to match the design system: faint grid, muted axes, foreground line.
export function E1rmChart({ data }: { data: ChartPoint[] }) {
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
            tickFormatter={(v: number) => `${Math.round(v)}`}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            formatter={(value) => [`${Math.round(Number(value))} lb`, "e1RM"]}
            contentStyle={{
              borderRadius: 8,
              fontSize: 12,
              background: "var(--background)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
          />
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
