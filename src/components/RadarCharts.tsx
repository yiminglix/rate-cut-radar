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
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function compactDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    year: "2-digit",
  }).format(date);
}

function last(points: SeriesPoint[], count: number): SeriesPoint[] {
  return points.slice(Math.max(points.length - count, 0));
}

function validPoints(points: SeriesPoint[]): SeriesPoint[] {
  return points.filter((point) => Number.isFinite(point.value));
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

function annualizedFromIndex(
  current: number,
  previous: number,
  months: number,
): number {
  return (Math.pow(current / previous, 12 / months) - 1) * 100;
}

function corePceThreeMonthAnnualizedSeries(points: SeriesPoint[]): SeriesPoint[] {
  const clean = validPoints(points);

  return clean.slice(3).map((point, index) => {
    const previous = clean[index];
    return {
      date: point.date,
      value: annualizedFromIndex(point.value, previous.value, 3),
    };
  });
}

function monthlyRateFromAnnualized(value: number): number | null {
  const annualMultiplier = 1 + value / 100;
  if (annualMultiplier <= 0) return null;
  return Math.pow(annualMultiplier, 1 / 12) - 1;
}

function annualizedTrimmedWindow(points: SeriesPoint[]): number | null {
  let multiplier = 1;

  for (const point of points) {
    const monthlyRate = monthlyRateFromAnnualized(point.value);
    if (monthlyRate === null) return null;
    multiplier *= 1 + monthlyRate;
  }

  return (Math.pow(multiplier, 12 / points.length) - 1) * 100;
}

function trimmedMeanSixMonthAnnualizedSeries(points: SeriesPoint[]): SeriesPoint[] {
  const clean = validPoints(points);

  return clean.slice(5).flatMap((point, index) => {
    const window = clean.slice(index, index + 6);
    const value = annualizedTrimmedWindow(window);

    return value === null
      ? []
      : [
          {
            date: point.date,
            value,
          },
        ];
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
      {[
        "油价是第一道通胀关口",
        "长端美债决定降息是否健康",
        "通胀需要自然降温",
      ].map(
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
    {
      key: "Core PCE 3M年化",
      points: corePceThreeMonthAnnualizedSeries(last(series.PCEPILFE, 24)),
    },
    {
      key: "Trimmed Mean PCE 6M年化",
      points: trimmedMeanSixMonthAnnualizedSeries(
        last(series.PCETRIM1M158SFRBDAL, 24),
      ),
    },
  ]);

  return (
    <div className="grid gap-4">
      <ChartPanel
        title="油价是第一道通胀关口"
        subtitle="Brent 越远离近期高点，能源通胀对降息空间的挤压越小。"
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
        title="长端美债决定降息是否健康"
        subtitle="2Y 可以先交易降息，10Y 和 30Y 才决定市场是否真正买账。"
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
        title="通胀需要自然降温"
        subtitle="Core PCE 3M 年化和 Trimmed Mean PCE 6M 年化需要同步放缓。"
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
              dataKey="Core PCE 3M年化"
              stroke="#0f9f8f"
              strokeWidth={2.2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Trimmed Mean PCE 6M年化"
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
