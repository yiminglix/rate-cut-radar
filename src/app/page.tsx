import { RadarCharts } from "@/components/RadarCharts";
import { generateDailyBrief, generateExecutiveSummary } from "@/lib/brief";
import { getDashboardData } from "@/lib/fred";
import { SERIES_META } from "@/lib/mock-data";
import { calculateRateCutRadar, getLatestPoint } from "@/lib/signals";
import type {
  AssetBias,
  AssetImpact,
  DashboardSeries,
  FredSeriesId,
  MarketMove,
  RateCutRadar,
  SignalColor,
  SignalResult,
} from "@/lib/types";

export const revalidate = 21_600;

const metricOrder: FredSeriesId[] = [
  "DCOILBRENTEU",
  "DGS2",
  "DGS10",
  "DGS30",
  "T10Y2Y",
  "PCEPILFE",
  "PCETRIM1M158SFRBDAL",
];

const signalTone: Record<
  SignalColor,
  {
    label: string;
    dot: string;
    badge: string;
    surface: string;
    text: string;
  }
> = {
  green: {
    label: "Green",
    dot: "bg-emerald-400",
    badge: "bg-emerald-400/10 text-emerald-700 ring-emerald-500/20",
    surface: "border-emerald-500/20 bg-emerald-50/80",
    text: "text-emerald-700",
  },
  yellow: {
    label: "Yellow",
    dot: "bg-amber-400",
    badge: "bg-amber-400/10 text-amber-700 ring-amber-500/20",
    surface: "border-amber-500/20 bg-amber-50/80",
    text: "text-amber-700",
  },
  red: {
    label: "Red",
    dot: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
    surface: "border-rose-500/20 bg-rose-50/80",
    text: "text-rose-700",
  },
};

const assetTone: Record<
  AssetBias,
  {
    label: string;
    className: string;
    dot: string;
  }
> = {
  bullish: {
    label: "bullish",
    className: "bg-emerald-400/10 text-emerald-700 ring-emerald-500/20",
    dot: "bg-emerald-400",
  },
  neutral: {
    label: "neutral",
    className: "bg-zinc-400/10 text-zinc-700 ring-zinc-500/20",
    dot: "bg-zinc-400",
  },
  bearish: {
    label: "bearish",
    className: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
    dot: "bg-rose-500",
  },
  volatile: {
    label: "volatile",
    className: "bg-amber-400/10 text-amber-700 ring-amber-500/20",
    dot: "bg-amber-400",
  },
};

const moveTone: Record<MarketMove["tone"], string> = {
  supportive: "text-emerald-700",
  risk: "text-rose-700",
  neutral: "text-zinc-700",
};

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function formatSeriesValue(seriesId: FredSeriesId, value: number): string {
  if (seriesId === "DCOILBRENTEU") return `$${value.toFixed(2)}`;
  if (seriesId === "PCEPILFE") return value.toFixed(2);
  return `${value.toFixed(2)}%`;
}

function deltaText(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function scoreStroke(radar: RateCutRadar): string {
  if (radar.politicalCutRisk) return "#e11d48";
  if (radar.score >= 80) return "#10b981";
  if (radar.score >= 60) return "#14b8a6";
  if (radar.score >= 40) return "#f59e0b";
  return "#e11d48";
}

function scoreText(radar: RateCutRadar): string {
  if (radar.politicalCutRisk) return "text-rose-500";
  if (radar.score >= 80) return "text-emerald-500";
  if (radar.score >= 60) return "text-teal-500";
  if (radar.score >= 40) return "text-amber-500";
  return "text-rose-500";
}

function ScoreRing({ radar }: { radar: RateCutRadar }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (radar.score / 100) * circumference;

  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg aria-hidden="true" className="h-full w-full rotate-[-90deg]" viewBox="0 0 144 144">
        <circle
          cx="72"
          cy="72"
          fill="none"
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="10"
        />
        <circle
          cx="72"
          cy="72"
          fill="none"
          r={radius}
          stroke={scoreStroke(radar)}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          strokeWidth="10"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={`font-mono text-5xl font-semibold leading-none ${scoreText(radar)}`}>
          {radar.score}
        </p>
        <p className="mt-1 font-mono text-sm font-semibold text-zinc-400">/100</p>
      </div>
    </div>
  );
}

function ScoreCard({ radar }: { radar: RateCutRadar }) {
  const deltaClass =
    radar.scoreDelta > 0
      ? "text-emerald-300"
      : radar.scoreDelta < 0
        ? "text-rose-300"
        : "text-zinc-300";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-white shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Rate Cut Score
          </p>
          <p className={`mt-2 font-mono text-lg font-semibold ${deltaClass}`}>
            {deltaText(radar.scoreDelta)} vs yesterday
          </p>
        </div>
        <span className="rounded-md bg-white/8 px-2 py-1 text-[11px] font-semibold uppercase text-zinc-300 ring-1 ring-white/10">
          V1.5
        </span>
      </div>
      <div className="mt-3 flex items-center justify-center">
        <ScoreRing radar={radar} />
      </div>
    </section>
  );
}

function RegimeCard({ radar }: { radar: RateCutRadar }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
        Current Regime
      </p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">{radar.status}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{radar.statusSummary}</p>
    </section>
  );
}

function FirstScreenImpact({ summary }: { summary: string }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
        Asset Impact Summary
      </p>
      <p className="mt-2 text-sm font-medium leading-6 text-zinc-950">{summary}</p>
    </section>
  );
}

function SignalPill({ color }: { color: SignalColor }) {
  const tone = signalTone[color];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${tone.badge}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
}

function MetricCard({
  seriesId,
  series,
}: {
  seriesId: FredSeriesId;
  series: DashboardSeries;
}) {
  const point = getLatestPoint(series[seriesId]);
  const meta = SERIES_META[seriesId];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex min-h-10 items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
            {meta.shortName}
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">{meta.id}</p>
        </div>
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
          {meta.frequency}
        </span>
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold text-zinc-950">
        {point ? formatSeriesValue(seriesId, point.value) : "N/A"}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {point ? point.date : "No usable observation"}
      </p>
    </div>
  );
}

function SignalCard({ signal }: { signal: SignalResult }) {
  const tone = signalTone[signal.color];

  return (
    <article className={`rounded-lg border p-4 shadow-sm ${tone.surface}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">{signal.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {signal.score}/{signal.maxScore} pts
          </p>
        </div>
        <SignalPill color={signal.color} />
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-700">{signal.summary}</p>
      <SignalDetails signal={signal} />
    </article>
  );
}

function SignalDetails({ signal }: { signal: SignalResult }) {
  if (signal.name === "oil") {
    return (
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <DetailItem label="Pullback" value={`${signal.details.pullbackPct ?? "N/A"}%`} />
        <DetailItem label="20D High" value={`${signal.details.high20 ?? "N/A"}`} />
        <DetailItem label="20D Avg" value={`${signal.details.average20 ?? "N/A"}`} />
      </dl>
    );
  }

  if (signal.name === "bond") {
    return (
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <DetailItem label="2Y" value={String(signal.details.twoYearChange ?? "N/A")} />
        <DetailItem label="10Y" value={String(signal.details.tenYearChange ?? "N/A")} />
        <DetailItem label="30Y" value={String(signal.details.thirtyYearChange ?? "N/A")} />
      </dl>
    );
  }

  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
      <DetailItem
        label="Core PCE"
        value={`${signal.details.coreLatestMomentum ?? "N/A"}%`}
      />
      <DetailItem
        label="Trimmed"
        value={`${signal.details.trimmedLatestMomentum ?? "N/A"}%`}
      />
    </dl>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/70 p-2 ring-1 ring-black/[0.04]">
      <dt className="text-[11px] font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 font-mono text-xs font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}

function WhatChangedToday({ radar }: { radar: RateCutRadar }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          What Changed Today
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">
          {radar.whatChanged.summary}
        </h2>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Score Delta
          </p>
          <p className="mt-3 font-mono text-5xl font-semibold">
            {deltaText(radar.whatChanged.scoreDelta)}
          </p>
          <p className="mt-2 text-sm text-zinc-400">vs previous trading day</p>
        </div>

        <div className="grid gap-3">
          {radar.signalChanges.map((change) => (
            <div
              key={change.name}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-950">{change.title}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{change.summary}</p>
              </div>
              <SignalPill color={change.currentColor} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {radar.whatChanged.keyMoves.map((move) => (
          <div key={move.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
              {move.label}
            </p>
            <p className={`mt-2 font-mono text-xl font-semibold ${moveTone[move.tone]}`}>
              {move.value}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{move.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AssetImpactCard({ impact }: { impact: AssetImpact }) {
  const tone = assetTone[impact.bias];

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-zinc-950">{impact.asset}</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${tone.className}`}
        >
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          {tone.label}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-600">{impact.summary}</p>
    </article>
  );
}

function AssetImpactSection({ radar }: { radar: RateCutRadar }) {
  return (
    <section>
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Asset Impact
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950">
          Cross-asset read-through
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {radar.assetImpact.map((impact) => (
          <AssetImpactCard key={impact.asset} impact={impact} />
        ))}
      </div>
    </section>
  );
}

function DailyBrief({
  executiveSummary,
  brief,
}: {
  executiveSummary: string;
  brief: string;
}) {
  return (
    <details className="group rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Daily Brief
          </p>
          <p className="mt-2 text-base font-medium leading-7 text-zinc-950">
            {executiveSummary}
          </p>
        </div>
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200 group-open:hidden">
          Open
        </span>
        <span className="hidden rounded-md bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline-flex">
          Close
        </span>
      </summary>
      <p className="mt-5 border-t border-zinc-200 pt-4 text-base leading-8 text-zinc-700">
        {brief}
      </p>
    </details>
  );
}

export default async function Home() {
  const data = await getDashboardData();
  const radar = calculateRateCutRadar(data.series);
  const brief = generateDailyBrief(radar, data.source);
  const executiveSummary = generateExecutiveSummary(radar);

  return (
    <main className="min-h-screen bg-[#f4f5f7] text-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              Macro Decision Tool
            </p>
            <h1 className="mt-1 text-xl font-semibold text-zinc-950 sm:text-2xl">
              Rate Cut Radar
            </h1>
            <p className="mt-0.5 text-sm font-medium text-zinc-500">降息雷达</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs text-zinc-600">{formatUpdatedAt(data.updatedAt)}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
              Source: {data.source}
            </p>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <ScoreCard radar={radar} />
          <div className="grid gap-3">
            <RegimeCard radar={radar} />
            <FirstScreenImpact summary={radar.assetImpactSummary} />
          </div>
        </section>

        {data.warning ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            {data.warning}
          </section>
        ) : null}

        <WhatChangedToday radar={radar} />

        <AssetImpactSection radar={radar} />

        <DailyBrief executiveSummary={executiveSummary} brief={brief} />

        <section className="grid gap-4 md:grid-cols-3">
          <SignalCard signal={radar.signals.oil} />
          <SignalCard signal={radar.signals.inflation} />
          <SignalCard signal={radar.signals.bond} />
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Key Metrics
              </p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-950">
                Latest macro inputs
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {metricOrder.map((seriesId) => (
              <MetricCard key={seriesId} seriesId={seriesId} series={data.series} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Charts
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Confirmation paths
            </h2>
          </div>
          <RadarCharts series={data.series} />
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Methodology
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950">Rules of the radar</h2>
          <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-700">
            <p>
              总分由三部分组成：Oil Signal 30 分，Inflation Signal 35 分，Bond
              Market Signal 35 分。Green 得满分，Yellow 得一半，Red 得 0 分。
            </p>
            <p>
              Oil Signal 使用 Brent 当前价格相对近 20 个有效交易日高点的回落幅度，并结合
              20 日均线判断能源价格是否配合降息预期。
            </p>
            <p>
              Bond Market Signal 比较 2Y、10Y、30Y 最近 5 个有效交易日变化。若短端下行但长端明显上行，
              状态会切换为 Political Cut Risk。
            </p>
            <p>
              Inflation Signal 使用最近 3 个 PCE 数据点。核心 PCE 转换为月度动能，Trimmed
              Mean PCE 使用 FRED 原始年化序列观察是否放缓。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
