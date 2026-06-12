"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface VolumeChartPoint {
  date: string;
  tonnage: number;
}

export function VolumeChart({ data }: { data: VolumeChartPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, "auto"]}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompact}
          />
          <Tooltip
            cursor={{ fill: "var(--surface)" }}
            formatter={(value) => [`${formatWhole(Number(value))} lb`, "tonnage"]}
            contentStyle={{
              borderRadius: 8,
              fontSize: 12,
              background: "var(--background)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted)" }}
          />
          <Bar dataKey="tonnage" fill="currentColor" opacity={0.14} radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="tonnage"
            stroke="currentColor"
            strokeWidth={2}
            dot={{ r: 2, fill: "currentColor" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatCompact(value: number) {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return `${Math.round(value)}`;
}

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
