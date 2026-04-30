import { RadarCharts } from "@/components/RadarCharts";
import { generateDailyBrief } from "@/lib/brief";
import { getDashboardData } from "@/lib/fred";
import { SERIES_META } from "@/lib/mock-data";
import { calculateRateCutRadar, getLatestPoint } from "@/lib/signals";
import type {
  DashboardSeries,
  FredSeriesId,
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
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    surface: "border-emerald-200 bg-emerald-50/70",
    text: "text-emerald-700",
  },
  yellow: {
    label: "Yellow",
    dot: "bg-amber-400",
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
    surface: "border-amber-200 bg-amber-50/70",
    text: "text-amber-700",
  },
  red: {
    label: "Red",
    dot: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
    surface: "border-rose-200 bg-rose-50/70",
    text: "text-rose-700",
  },
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

function scoreTone(radar: RateCutRadar): string {
  if (radar.politicalCutRisk) return "text-rose-600";
  if (radar.score >= 80) return "text-emerald-600";
  if (radar.score >= 60) return "text-teal-600";
  if (radar.score >= 40) return "text-amber-600";
  return "text-rose-600";
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
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${tone.badge}`}
        >
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          {tone.label}
        </span>
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

export default async function Home() {
  const data = await getDashboardData();
  const radar = calculateRateCutRadar(data.series);
  const brief = generateDailyBrief(radar, data.source);

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-zinc-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                Macro Dashboard
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950">
                Rate Cut Radar / 降息雷达
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                跟踪油价、通胀和美债是否共同指向健康降息预期。
              </p>
            </div>
            <div className="rounded-md bg-zinc-100 px-3 py-2 text-left sm:text-right">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                Updated
              </p>
              <p className="mt-1 font-mono text-xs text-zinc-800">
                {formatUpdatedAt(data.updatedAt)}
              </p>
              <p className="mt-1 text-[11px] uppercase text-zinc-500">
                Source: {data.source}
              </p>
            </div>
          </div>
        </header>

        {data.warning ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            {data.warning}
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Rate Cut Score</p>
            <div className="mt-4 flex items-end gap-3">
              <p className={`font-mono text-7xl font-semibold leading-none ${scoreTone(radar)}`}>
                {radar.score}
              </p>
              <div className="pb-2">
                <p className="font-mono text-xl font-semibold text-zinc-400">/100</p>
                <p
                  className={`mt-1 font-mono text-sm font-semibold ${
                    radar.scoreDelta >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {deltaText(radar.scoreDelta)} vs prev
                </p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
                style={{ width: `${radar.score}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Current Status</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-normal text-zinc-950">
              {radar.status}
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-700">
              {radar.statusSummary}
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <SignalCard signal={radar.signals.oil} />
          <SignalCard signal={radar.signals.inflation} />
          <SignalCard signal={radar.signals.bond} />
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-500">Daily Brief</p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-950">中文摘要</h2>
            </div>
            <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">
              Template
            </span>
          </div>
          <p className="mt-4 text-base leading-8 text-zinc-700">{brief}</p>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-500">Key Metrics</p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-950">关键指标</h2>
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
            <p className="text-sm font-medium text-zinc-500">Charts</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">趋势图</h2>
          </div>
          <RadarCharts series={data.series} />
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Methodology</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950">方法说明</h2>
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
