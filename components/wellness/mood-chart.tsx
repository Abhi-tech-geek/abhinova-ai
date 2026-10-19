"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MoodLogRecord } from "@/types/wellness";

export function MoodChart({ logs }: { logs: MoodLogRecord[] }) {
  if (logs.length < 2) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground" data-testid="wellness-moodchart-empty">
        Do check-ins on a few days and your mood line will appear here.
      </p>
    );
  }

  const data = [...logs]
    .reverse()
    .map((log) => ({
      date: new Date(log.created_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      mood: log.mood,
    }));

  return (
    <div className="h-56 w-full" data-testid="wellness-moodchart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -28 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="mood"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--primary))" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
