"use client";

import { useSyncExternalStore } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardSeries, SeriesPoint } from "@/lib/types";

type RadarChartsProps = {
  series: DashboardSeries;
};

type ChartDatum = {
  date: string;
  [key: string]: string | number;
};

const axisStyle = {
  fill: "#5f6673",
  fontSize: 11,
};

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function compactDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function last(points: SeriesPoint[], count: number): SeriesPoint[] {
  return points.slice(Math.max(points.length - count, 0));
}

function mergeSeries(
  inputs: Array<{ key: string; points: SeriesPoint[]; transform?: (value: number) => number }>,
): ChartDatum[] {
  const rows = new Map<string, ChartDatum>();

  inputs.forEach(({ key, points, transform }) => {
    points.forEach((point) => {
      const row = rows.get(point.date) ?? { date: point.date };
      row[key] = transform ? transform(point.value) : point.value;
      rows.set(point.date, row);
    });
  });

  return Array.from(rows.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function corePceMomentum(points: SeriesPoint[]): SeriesPoint[] {
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    return {
      date: point.date,
      value: ((point.value - previous.value) / previous.value) * 100,
    };
  });
}

function tooltipFormatter(value: unknown, name: unknown) {
  const formatted =
    typeof value === "number" ? Number(value).toFixed(2) : String(value);
  return [formatted, String(name)];
}

function axisNumberFormatter(value: unknown): string {
  return typeof value === "number" ? value.toFixed(2) : String(value);
}

function dateLabelFormatter(value: unknown): string {
  return typeof value === "string" ? formatDate(value) : String(value ?? "");
}

function compactDateLabelFormatter(value: unknown): string {
  return typeof value === "string" ? compactDate(value) : String(value ?? "");
}

function ChartPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>
      </div>
      <div className="h-64 w-full sm:h-72">{children}</div>
    </section>
  );
}

function ChartSkeleton() {
  return (
    <div className="grid gap-4">
      {["Brent 原油", "美债收益率曲线", "核心 PCE 与 Trimmed Mean PCE"].map(
        (title) => (
          <section
            key={title}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3">
              <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
              <div className="mt-2 h-3 w-3/4 rounded bg-zinc-100" />
            </div>
            <div className="h-64 rounded-md bg-zinc-100 sm:h-72" />
          </section>
        ),
      )}
    </div>
  );
}

function subscribeToClientReady() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function useIsClient() {
  return useSyncExternalStore(
    subscribeToClientReady,
    getClientSnapshot,
    getServerSnapshot,
  );
}

export function RadarCharts({ series }: RadarChartsProps) {
  const mounted = useIsClient();

  if (!mounted) {
    return <ChartSkeleton />;
  }

  const oilData = last(series.DCOILBRENTEU, 90).map((point) => ({
    date: point.date,
    Brent: point.value,
  }));

  const yieldData = mergeSeries([
    { key: "2Y", points: last(series.DGS2, 90) },
    { key: "10Y", points: last(series.DGS10, 90) },
    { key: "30Y", points: last(series.DGS30, 90) },
  ]);

  const pceData = mergeSeries([
    { key: "Core PCE MoM", points: corePceMomentum(last(series.PCEPILFE, 18)) },
    { key: "Trimmed Mean", points: last(series.PCETRIM1M158SFRBDAL, 18) },
  ]);

  return (
    <div className="grid gap-4">
      <ChartPanel
        title="Brent 原油"
        subtitle="近 90 个有效交易日，观察油价是否从高位回落。"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          initialDimension={{ width: 360, height: 256 }}
        >
          <LineChart data={oilData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eceff3" vertical={false} />
            <XAxis
              dataKey="date"
              minTickGap={28}
              tick={axisStyle}
              tickFormatter={formatDate}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisStyle}
              tickFormatter={axisNumberFormatter}
              tickLine={false}
              axisLine={false}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip formatter={tooltipFormatter} labelFormatter={dateLabelFormatter} />
            <Line
              type="monotone"
              dataKey="Brent"
              stroke="#0f9f8f"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel
        title="美债收益率曲线"
        subtitle="2Y 代表政策预期，10Y/30Y 用来确认长端是否买账。"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          initialDimension={{ width: 360, height: 256 }}
        >
          <LineChart data={yieldData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eceff3" vertical={false} />
            <XAxis
              dataKey="date"
              minTickGap={28}
              tick={axisStyle}
              tickFormatter={formatDate}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisStyle}
              tickFormatter={axisNumberFormatter}
              tickLine={false}
              axisLine={false}
              domain={["dataMin - 0.1", "dataMax + 0.1"]}
            />
            <Tooltip formatter={tooltipFormatter} labelFormatter={dateLabelFormatter} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="2Y" stroke="#5258e8" strokeWidth={2.2} dot={false} />
            <Line type="monotone" dataKey="10Y" stroke="#0f9f8f" strokeWidth={2.2} dot={false} />
            <Line type="monotone" dataKey="30Y" stroke="#f27b35" strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel
        title="核心 PCE 与 Trimmed Mean PCE"
        subtitle="核心 PCE 转为月度动能，Trimmed Mean 使用 FRED 原始年化序列。"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          initialDimension={{ width: 360, height: 256 }}
        >
          <LineChart data={pceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eceff3" vertical={false} />
            <XAxis
              dataKey="date"
              minTickGap={24}
              tick={axisStyle}
              tickFormatter={compactDate}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisStyle}
              tickFormatter={axisNumberFormatter}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={tooltipFormatter}
              labelFormatter={compactDateLabelFormatter}
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="Core PCE MoM"
              stroke="#0f9f8f"
              strokeWidth={2.2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Trimmed Mean"
              stroke="#d64550"
              strokeWidth={2.2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
