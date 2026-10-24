"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyUsage } from "@/types/admin";

// Usage-dashboard charts. Rules (dataviz method): one y-axis per chart, solid
// recessive horizontal grid, 2px lines, rounded bar ends, single-hue charts
// use --chart-1; the only two-series chart pairs it with the CVD-validated
// --chart-pair. Text always uses text tokens, never the series color.

const SERIES_1 = "hsl(var(--chart-1))";
const SERIES_2 = "hsl(var(--chart-pair))";
const GRID = "hsl(var(--border))";
const TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-24" → "24 Oct" (deterministic: same on server and client). */
export function shortDay(isoDay: string): string {
  const [, m, d] = isoDay.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-glass">
      <p className="mb-1 font-medium text-foreground">{label ? shortDay(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** AI replies per day — single series area. */
export function AiRepliesChart({ data }: { data: DailyUsage[] }) {
  return (
    <div className="h-56 w-full" data-testid="admin-chart-ai">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="anv-ai-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_1} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES_1} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} strokeOpacity={0.6} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tickFormatter={compact} tick={TICK} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="aiReplies"
            name="AI replies"
            stroke={SERIES_1}
            strokeWidth={2}
            fill="url(#anv-ai-fill)"
            activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** New visitors vs active users — the one two-series chart (legend + end labels). */
export function PeopleChart({ data }: { data: DailyUsage[] }) {
  const last = data[data.length - 1];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_1 }} aria-hidden />
          New visitors
          {last && <span className="font-semibold text-foreground">{last.newVisitors} today</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_2 }} aria-hidden />
          Active testers
          {last && <span className="font-semibold text-foreground">{last.activeUsers} today</span>}
        </span>
      </div>
      <div className="h-52 w-full" data-testid="admin-chart-people">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeOpacity={0.6} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tickFormatter={compact} tick={TICK} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="newVisitors"
              name="New visitors"
              stroke={SERIES_1}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="activeUsers"
              name="Active testers"
              stroke={SERIES_2}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const LABEL_WIDTH = 178;
const LABEL_MAX_CHARS = 24;

/**
 * Category label that never wraps (Recharts' default tick breaks long labels
 * into stacked lines): one line, ellipsis past LABEL_MAX_CHARS, full text on hover.
 */
function SingleLineTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const full = payload?.value ?? "";
  const shown = full.length > LABEL_MAX_CHARS ? `${full.slice(0, LABEL_MAX_CHARS - 1)}…` : full;
  return (
    <text x={x - 8} y={y} dy={4} textAnchor="end" fontSize={12} fill="hsl(var(--foreground))">
      <title>{full}</title>
      {shown}
    </text>
  );
}

/** Horizontal single-hue bars with the value at each tip. */
export function RankedBars({
  rows,
  testID,
  unit,
}: {
  rows: { label: string; value: number }[];
  testID: string;
  unit: string;
}) {
  if (rows.every((r) => r.value === 0)) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground" data-testid={`${testID}-empty`}>
        No {unit} in this period yet.
      </p>
    );
  }
  const height = Math.max(120, rows.length * 36);
  return (
    <div className="w-full" style={{ height }} data-testid={testID}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={<SingleLineTick />}
            axisLine={false}
            tickLine={false}
            width={LABEL_WIDTH}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-glass">
                  <span className="font-medium text-foreground">{payload[0].payload.label}</span>
                  <span className="ml-3 font-semibold text-foreground">{payload[0].value}</span>
                  <span className="ml-1 text-muted-foreground">{unit}</span>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
