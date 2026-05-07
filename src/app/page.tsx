import { RadarCharts } from "@/components/RadarCharts";
import { generateDailyBrief, generateExecutiveSummary } from "@/lib/brief";
import { getDashboardData } from "@/lib/fred";
import { calculateRateCutRadar } from "@/lib/signals";
import type {
  AssetBias,
  AssetImpact,
  DataSource,
  MarketMove,
  RadarStatus,
  RateCutRadar,
  SignalColor,
  SignalResult,
} from "@/lib/types";

export const revalidate = 3_600;

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
    label: "已确认",
    dot: "bg-emerald-400",
    badge: "bg-emerald-400/10 text-emerald-700 ring-emerald-500/20",
    surface: "border-emerald-500/20 bg-emerald-50/80",
    text: "text-emerald-700",
  },
  yellow: {
    label: "未确认",
    dot: "bg-amber-400",
    badge: "bg-amber-400/10 text-amber-700 ring-amber-500/20",
    surface: "border-amber-500/20 bg-amber-50/80",
    text: "text-amber-700",
  },
  red: {
    label: "偏粘",
    dot: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
    surface: "border-rose-500/20 bg-rose-50/80",
    text: "text-rose-700",
  },
  stale: {
    label: "数据不足",
    dot: "bg-zinc-400",
    badge: "bg-zinc-400/10 text-zinc-700 ring-zinc-500/20",
    surface: "border-zinc-300 bg-zinc-50",
    text: "text-zinc-600",
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
    label: "利好",
    className: "bg-emerald-400/10 text-emerald-700 ring-emerald-500/20",
    dot: "bg-emerald-400",
  },
  neutral: {
    label: "中性",
    className: "bg-zinc-400/10 text-zinc-700 ring-zinc-500/20",
    dot: "bg-zinc-400",
  },
  bearish: {
    label: "利空",
    className: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
    dot: "bg-rose-500",
  },
  volatile: {
    label: "高波动",
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

function deltaText(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function percentDetail(value: unknown): string {
  return typeof value === "number" ? `${value}%` : "数据不足";
}

function statusLabel(status: RadarStatus): string {
  const labels: Record<RadarStatus, string> = {
    "Healthy Rate Cut Expectation": "健康降息预期",
    "Rate Cut Expectation Warming": "降息预期升温",
    "Mixed / Wait and See": "混合观望",
    "Rate Cut Expectation Weak": "降息预期偏弱",
    "Political Cut Risk": "政治化降息风险",
    "Rate Cut Expectation Failed": "降息预期失败",
  };

  return labels[status];
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
          <p className="text-xs font-semibold tracking-[0.16em] text-zinc-400">
            降息预期分数
          </p>
          <p className={`mt-2 font-mono text-lg font-semibold ${deltaClass}`}>
            今日变化 {deltaText(radar.scoreDelta)}
          </p>
        </div>
        <span className="rounded-md bg-white/8 px-2 py-1 text-[11px] font-semibold text-zinc-300 ring-1 ring-white/10">
          V1.6
        </span>
      </div>
      <div className="mt-3 flex items-center justify-center">
        <ScoreRing radar={radar} />
      </div>
    </section>
  );
}

function RegimeCard({
  radar,
  executiveSummary,
}: {
  radar: RateCutRadar;
  executiveSummary: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">当前状态</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">
        {statusLabel(radar.status)}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{radar.statusSummary}</p>
      <div className="mt-4 rounded-md bg-zinc-950 p-3 text-white">
        <p className="text-xs font-semibold text-zinc-400">今日一句话</p>
        <p className="mt-1 text-sm font-medium leading-6">{executiveSummary}</p>
      </div>
    </section>
  );
}

function FirstScreenImpact({ radar }: { radar: RateCutRadar }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">资产影响</p>
      <p className="mt-2 text-sm font-medium leading-6 text-zinc-950">
        {radar.assetImpactSummary}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {radar.assetImpact.map((impact) => {
          const tone = assetTone[impact.bias];
          return (
            <span
              key={impact.asset}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${tone.className}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              {impact.asset} {tone.label}
            </span>
          );
        })}
      </div>
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

function SignalCard({ signal }: { signal: SignalResult }) {
  const tone = signalTone[signal.color];

  return (
    <article className={`rounded-lg border p-4 shadow-sm ${tone.surface}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">{signal.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {signal.score}/{signal.maxScore} 分
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
        <DetailItem label="20日回撤" value={percentDetail(signal.details.pullbackPct)} />
        <DetailItem label="20日高点" value={String(signal.details.high20 ?? "数据不足")} />
        <DetailItem label="20日均线" value={String(signal.details.average20 ?? "数据不足")} />
      </dl>
    );
  }

  if (signal.name === "bond") {
    return (
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <DetailItem label="2Y 5日" value={String(signal.details.twoYearChange ?? "数据不足")} />
        <DetailItem label="10Y 5日" value={String(signal.details.tenYearChange ?? "数据不足")} />
        <DetailItem label="30Y 5日" value={String(signal.details.thirtyYearChange ?? "数据不足")} />
      </dl>
    );
  }

  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
      <DetailItem
        label="Core YoY"
        value={percentDetail(signal.details.corePceYoy)}
      />
      <DetailItem
        label="Core 3M"
        value={percentDetail(signal.details.corePceThreeMonthAnnualized)}
      />
      <DetailItem
        label="Trimmed 6M"
        value={percentDetail(signal.details.trimmedMeanSixMonthAnnualized)}
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
  const changedSignals = radar.signalChanges.filter((change) => change.changed);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">今日变化</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">
        {radar.whatChanged.summary}
      </h2>
      <div className="mt-5 grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-white">
          <p className="text-xs font-semibold tracking-[0.14em] text-zinc-400">
            分数变化
          </p>
          <p className="mt-3 font-mono text-5xl font-semibold">
            {deltaText(radar.whatChanged.scoreDelta)}
          </p>
          <p className="mt-2 text-sm text-zinc-400">较上一交易日</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-zinc-500">
            信号变化
          </p>
          <div className="mt-3 space-y-2">
            {changedSignals.length > 0 ? (
              changedSignals.map((change) => (
                <div key={change.name} className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-6 text-zinc-700">{change.summary}</p>
                  <SignalPill color={change.currentColor} />
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-zinc-700">
                三盏灯未变化，今天主要观察油价、美债和通胀的延续性。
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {radar.whatChanged.keyMoves.map((move) => (
          <MoveCard key={move.label} move={move} />
        ))}
      </div>
    </section>
  );
}

function MoveCard({ move }: { move: MarketMove }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold tracking-[0.1em] text-zinc-500">{move.label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${moveTone[move.tone]}`}>
        {move.value}
      </p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{move.detail}</p>
    </div>
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
        <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">资产影响</p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950">
          高弹性资产怎么理解
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

function DailyBrief({ brief }: { brief: string }) {
  return (
    <details className="group rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">
            今日简报
          </p>
          <p className="mt-2 text-base font-medium leading-7 text-zinc-950">
            详细简报
          </p>
        </div>
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200 group-open:hidden">
          展开
        </span>
        <span className="hidden rounded-md bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline-flex">
          收起
        </span>
      </summary>
      <p className="mt-5 border-t border-zinc-200 pt-4 text-base leading-8 text-zinc-700">
        {brief}
      </p>
    </details>
  );
}

function KeyMetrics({ radar }: { radar: RateCutRadar }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">
            关键指标
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950">最新宏观指标</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {radar.keyMetrics.map((metric) => (
          <MoveCard key={metric.label} move={metric} />
        ))}
      </div>
    </section>
  );
}

function Methodology() {
  return (
    <details className="group rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">
            方法说明
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950">
            降息预期健康度如何计算
          </h2>
        </div>
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200 group-open:hidden">
          展开
        </span>
        <span className="hidden rounded-md bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline-flex">
          收起
        </span>
      </summary>
      <div className="mt-4 space-y-4 border-t border-zinc-200 pt-4 text-sm leading-7 text-zinc-700">
        <p>
          总分由三部分组成：油价信号 30 分，通胀信号 35 分，美债信号 35 分。已确认得满分，未确认得一半，偏粘或数据不足得 0 分。
        </p>
        <p>
          油价信号使用 Brent 当前价格相对近 20 个有效交易日高点的回撤，并结合 20 日均线判断能源通胀压力是否缓和。FRED Brent 现货若明显滞后，会用更接近交易盘面的 Brent 市场报价补最新点。
        </p>
        <p>
          通胀信号不使用 Core PCE 或 Trimmed Mean PCE 的指数水平判断方向，而是使用 Core PCE YoY、Core PCE 3M 年化和 Trimmed Mean PCE 6M 年化判断底层通胀是否自然降温。
        </p>
        <p>
          美债信号比较 2Y、10Y、30Y 最近 5 个有效交易日变化。若 2Y 下行但 10Y/30Y 明显上行，状态会切换为政治化降息风险。
        </p>
      </div>
    </details>
  );
}

function sourceLabel(source: DataSource): string {
  const labels: Record<DataSource, string> = {
    fred: "FRED",
    "fred+market": "FRED + 市场报价",
    partial: "部分 FRED + 模拟数据",
    mock: "模拟数据",
  };

  return labels[source];
}

function DataNotice({
  warning,
  notices,
}: {
  warning?: string;
  notices?: string[];
}) {
  if (!warning && (!notices || notices.length === 0)) return null;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
      {warning ? <p className="font-medium">{warning}</p> : null}
      {notices && notices.length > 0 ? (
        <ul className={warning ? "mt-2 space-y-1" : "space-y-1"}>
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </section>
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
            <p className="text-xs font-semibold tracking-[0.2em] text-teal-700">
              降息预期健康度仪表盘
            </p>
            <h1 className="mt-1 text-xl font-semibold text-zinc-950 sm:text-2xl">
              Rate Cut Radar
            </h1>
            <p className="mt-0.5 text-sm font-medium text-zinc-500">降息雷达</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs text-zinc-600">{formatUpdatedAt(data.updatedAt)}</p>
            <p className="mt-1 text-[11px] tracking-[0.12em] text-zinc-400">
              数据源：{sourceLabel(data.source)}
            </p>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <ScoreCard radar={radar} />
          <div className="grid gap-3">
            <RegimeCard radar={radar} executiveSummary={executiveSummary} />
            <FirstScreenImpact radar={radar} />
          </div>
        </section>

        <DataNotice warning={data.warning} notices={data.notices} />

        <DailyBrief brief={brief} />

        <WhatChangedToday radar={radar} />

        <section className="grid gap-4 md:grid-cols-3">
          <SignalCard signal={radar.signals.oil} />
          <SignalCard signal={radar.signals.inflation} />
          <SignalCard signal={radar.signals.bond} />
        </section>

        <AssetImpactSection radar={radar} />

        <KeyMetrics radar={radar} />

        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">
              验证路径
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              从油价到通胀，再到长端美债
            </h2>
          </div>
          <RadarCharts series={data.series} />
        </section>

        <Methodology />
      </div>
    </main>
  );
}
