"use client";

import {
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

export function E1rmChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            tickFormatter={(v: number) => `${Math.round(v)}`}
          />
          <Tooltip
            formatter={(value) => [`${Math.round(Number(value))} lb`, "e1RM"]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke="currentColor"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
