import { RadarCharts } from "@/components/RadarCharts";
import { generateDailyBrief, generateExecutiveSummary } from "@/lib/brief";
import { getDashboardData } from "@/lib/fred";
import { calculateRateCutRadar } from "@/lib/signals";
import type { ReactNode } from "react";
import type {
  AssetBias,
  AssetImpact,
  DataQualityReport,
  DataQualityStatus,
  DataSource,
  DecisionTone,
  MarketContext,
  MarketMove,
  PriceConfirmation,
  RadarStatus,
  RateCutRadar,
  SignalColor,
  SignalName,
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

const decisionTone: Record<
  DecisionTone,
  {
    label: string;
    className: string;
    dot: string;
    surface: string;
  }
> = {
  supportive: {
    label: "支持",
    className: "bg-emerald-400/10 text-emerald-700 ring-emerald-500/20",
    dot: "bg-emerald-400",
    surface: "border-emerald-500/20 bg-emerald-50/80",
  },
  watch: {
    label: "待确认",
    className: "bg-amber-400/10 text-amber-700 ring-amber-500/20",
    dot: "bg-amber-400",
    surface: "border-amber-500/20 bg-amber-50/80",
  },
  risk: {
    label: "风险",
    className: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
    dot: "bg-rose-500",
    surface: "border-rose-500/20 bg-rose-50/80",
  },
  neutral: {
    label: "中性",
    className: "bg-zinc-400/10 text-zinc-700 ring-zinc-500/20",
    dot: "bg-zinc-400",
    surface: "border-zinc-200 bg-zinc-50",
  },
};

const dataQualityTone: Record<
  DataQualityReport["status"],
  {
    label: string;
    className: string;
  }
> = {
  pass: {
    label: "数据通过",
    className: "bg-emerald-400/10 text-emerald-700 ring-emerald-500/20",
  },
  watch: {
    label: "数据关注",
    className: "bg-amber-400/10 text-amber-700 ring-amber-500/20",
  },
  fail: {
    label: "数据降级",
    className: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
  },
};

const dataQualityStatusLabel: Record<DataQualityStatus, string> = {
  fresh: "新鲜",
  "expected-lag": "最新可用",
  stale: "滞后",
  missing: "缺失",
};

const priceConfirmationLabel: Record<PriceConfirmation, string> = {
  confirmed: "价格确认",
  unconfirmed: "未确认",
  against: "价格反向",
  missing: "价格缺失",
};

function dataQualityItemTone(status: DataQualityStatus): string {
  if (status === "fresh") return "text-emerald-700";
  if (status === "expected-lag") return "text-zinc-700";
  if (status === "stale") return "text-amber-700";
  return "text-rose-700";
}

function priceConfirmationTone(status: PriceConfirmation): string {
  if (status === "confirmed") return "bg-emerald-400/10 text-emerald-700 ring-emerald-500/20";
  if (status === "against") return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  if (status === "missing") return "bg-zinc-400/10 text-zinc-700 ring-zinc-500/20";
  return "bg-amber-400/10 text-amber-700 ring-amber-500/20";
}

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

function signalColorLabel(name: SignalName, color: SignalColor): string {
  if (color === "green") return "已确认";
  if (color === "yellow") return "未确认";
  if (color === "stale") return "数据不足";
  return name === "inflation" ? "偏粘" : "风险";
}

function percentDetail(value: unknown): string {
  return typeof value === "number" ? `${value}%` : "数据不足";
}

function monthDetail(value: unknown): string {
  if (typeof value !== "string") return "数据不足";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Shanghai",
  }).format(date);
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

function DataQualityBadge({ report }: { report: DataQualityReport }) {
  const tone = dataQualityTone[report.status];

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${tone.className}`}
    >
      {tone.label}
    </span>
  );
}

function DecisionPill({
  tone,
  children,
}: {
  tone: DecisionTone;
  children: ReactNode;
}) {
  const style = decisionTone[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${style.className}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {children}
    </span>
  );
}

function DecisionHero({
  radar,
  dataQuality,
  executiveSummary,
}: {
  radar: RateCutRadar;
  dataQuality: DataQualityReport;
  executiveSummary: string;
}) {
  const confidenceClass =
    radar.decision.confidence === "high"
      ? "text-emerald-400"
      : radar.decision.confidence === "medium"
        ? "text-amber-300"
        : "text-rose-300";
  const decisionSummary =
    dataQuality.status === "fail"
      ? "关键数据未通过检验，今天只看风险提示，不把结论当成交易信号。"
      : radar.decision.summary;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-zinc-400">
            今日结论
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-white sm:text-3xl">
            {radar.decision.headline}
          </h2>
        </div>
        <span className="rounded-md bg-white/8 px-2 py-1 text-[11px] font-semibold text-zinc-300 ring-1 ring-white/10">
          V1.9
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">{decisionSummary}</p>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {radar.decision.conclusions.map((conclusion) => (
          <article
            key={conclusion.title}
            className="rounded-md bg-white/[0.06] p-3 ring-1 ring-white/10"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-zinc-400">
                {conclusion.title}
              </p>
              <DecisionPill tone={conclusion.tone}>
                {decisionTone[conclusion.tone].label}
              </DecisionPill>
            </div>
            <h3 className="mt-3 text-base font-semibold leading-6 text-white">
              {conclusion.verdict}
            </h3>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              {conclusion.summary}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded-md bg-white/[0.06] p-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-zinc-400">
            分数
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-white">
            {radar.score}
            <span className="text-sm text-zinc-500">/100</span>
          </p>
        </div>
        <div className="rounded-md bg-white/[0.06] p-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-zinc-400">
            今日变化
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-white">
            {deltaText(radar.scoreDelta)}
          </p>
        </div>
        <div className="rounded-md bg-white/[0.06] p-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-zinc-400">
            当前状态
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-white">
            {statusLabel(radar.status)}
          </p>
        </div>
        <div className="rounded-md bg-white/[0.06] p-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-zinc-400">
            置信度
          </p>
          <p className={`mt-2 text-sm font-semibold leading-6 ${confidenceClass}`}>
            {radar.decision.confidenceLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DataQualityBadge report={dataQuality} />
        <span className="text-xs leading-5 text-zinc-400">{executiveSummary}</span>
      </div>
    </section>
  );
}

function PolicyPricingCard({ marketContext }: { marketContext?: MarketContext }) {
  const pricing = marketContext?.policyPricing;
  if (!pricing) return null;

  const stanceLabel =
    pricing.stance === "cut"
      ? "偏降息"
      : pricing.stance === "hike"
        ? "偏加息"
        : pricing.stance === "neutral"
          ? "未明显降息"
          : "待确认";
  const stanceClass =
    pricing.stance === "cut"
      ? "text-emerald-700"
      : pricing.stance === "hike"
        ? "text-rose-700"
        : "text-amber-700";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">
            政策定价
          </p>
          <h2 className={`mt-2 text-xl font-semibold ${stanceClass}`}>
            {stanceLabel}
          </h2>
        </div>
        <a
          className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200"
          href={pricing.cmeFedWatchUrl}
          rel="noreferrer"
          target="_blank"
        >
          CME
        </a>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <DetailItem label="ZQ=F隐含" value={`${pricing.impliedRate}%`} />
        <DetailItem
          label="DFF"
          value={
            pricing.effectiveFedFundsRate === undefined
              ? "数据不足"
              : `${pricing.effectiveFedFundsRate}%`
          }
        />
        <DetailItem
          label="差值"
          value={
            pricing.impliedDeltaBps === undefined
              ? "数据不足"
              : `${pricing.impliedDeltaBps > 0 ? "+" : ""}${pricing.impliedDeltaBps}基点`
          }
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{pricing.note}</p>
    </section>
  );
}

function SignalPill({ color, label }: { color: SignalColor; label?: string }) {
  const tone = signalTone[color];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${tone.badge}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
      {label ?? tone.label}
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
        <SignalPill color={signal.color} label={signalColorLabel(signal.name, signal.color)} />
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

  if (signal.name === "labor") {
    return (
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <DetailItem
          label="最新初请"
          value={String(signal.details.currentClaimsLabel ?? "数据不足")}
        />
        <DetailItem
          label="4周均值"
          value={String(signal.details.recent4wAverageLabel ?? "数据不足")}
        />
        <DetailItem
          label="4周变化"
          value={percentDetail(signal.details.fourWeekChangePct)}
        />
      </dl>
    );
  }

  if (signal.name === "credit") {
    return (
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <DetailItem
          label="HY OAS"
          value={
            typeof signal.details.highYieldOas === "number"
              ? `${signal.details.highYieldOas}%`
              : "数据不足"
          }
        />
        <DetailItem
          label="5日变化"
          value={String(signal.details.highYieldOasChange ?? "数据不足")}
        />
      </dl>
    );
  }

  if (signal.name === "inflationExpectations") {
    return (
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <DetailItem
          label="5Y5Y"
          value={
            typeof signal.details.fiveYearForward === "number"
              ? `${signal.details.fiveYearForward}%`
              : "数据不足"
          }
        />
        <DetailItem
          label="10Y BE"
          value={
            typeof signal.details.tenYearBreakeven === "number"
              ? `${signal.details.tenYearBreakeven}%`
              : "数据不足"
          }
        />
      </dl>
    );
  }

  const coreMonth = monthDetail(signal.details.corePceLatestDate);
  const trimmedMonth = monthDetail(signal.details.trimmedMeanLatestDate);
  const monthText =
    coreMonth === trimmedMonth
      ? `当前最新官方月份为 ${coreMonth}。`
      : `Core PCE 最新为 ${coreMonth}，Trimmed Mean PCE 最新为 ${trimmedMonth}。`;
  const nowcastText =
    typeof signal.details.nowcastCorePceMom === "number" &&
    typeof signal.details.nowcastCorePceYoy === "number"
      ? `Cleveland Fed nowcast 补到 ${signal.details.nowcastLatestMonth}：Core PCE MoM ${signal.details.nowcastCorePceMom}%，YoY ${signal.details.nowcastCorePceYoy}%，更新 ${signal.details.nowcastUpdated}。`
      : "Cleveland Fed nowcast 暂未接入，当前仅使用官方月频 PCE。";

  return (
    <>
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
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        PCE 是月频官方数据，通常滞后发布；{monthText}
      </p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{nowcastText}</p>
    </>
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
                  <SignalPill
                    color={change.currentColor}
                    label={signalColorLabel(change.name, change.currentColor)}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-zinc-700">
                核心信号和健康校验未变化，今天主要观察油价、美债、就业和信用的延续性。
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
  const macroTone = assetTone[impact.macroBias];

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
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${macroTone.className}`}
        >
          宏观 {macroTone.label}
        </span>
        <span
          className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${priceConfirmationTone(
            impact.priceConfirmation,
          )}`}
        >
          {priceConfirmationLabel[impact.priceConfirmation]}
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
          总分仍为 100 分，由三类核心信号和三类健康校验组成：油价 20 分，通胀 25 分，美债 25 分，劳动力 10 分，信用压力 10 分，通胀预期 10 分。已确认得满分，未确认得一半，风险、偏粘或数据不足得 0 分。
        </p>
        <p>
          油价信号使用 Brent 当前价格相对近 20 个有效交易日高点的回撤，并结合 20 日均线判断能源通胀压力是否缓和。FRED Brent 现货若明显滞后，会用更接近交易盘面的 Brent 市场报价补最新点。
        </p>
        <p>
          通胀信号不使用 Core PCE 或 Trimmed Mean PCE 的指数水平判断方向，而是使用 Core PCE YoY、Core PCE 3M 年化和 Trimmed Mean PCE 6M 年化判断底层通胀是否自然降温。PCE 是月频官方数据，页面会显示当前使用的最新官方月份。
        </p>
        <p>
          美债信号比较 2Y、10Y、30Y 最近 5 个有效交易日变化。若 2Y 下行但 10Y/30Y 明显上行，状态会切换为政治化降息风险。
        </p>
        <p>
          健康校验用来区分健康降息和压力降息：初请失业金判断就业是否温和降温，高收益债 OAS 判断信用市场是否恐慌，5Y5Y 与 10Y breakeven 判断通胀预期是否仍被锚住。若就业或信用压力明显恶化，即使降息预期升温，也不会直接标记为健康降息。
        </p>
        <p>
          V1.9 不再让总分单独决定首页结论。首页先看三条线：政策定价是否真的押注降息，降息健康度是否通过通胀、美债、就业和信用校验，资产价格是否确认宏观方向。若任何关键线索反向，结论会降级。
        </p>
        <p>
          数据检验会检查关键数据是否新鲜：美债和 Brent 必须使用最新可用日频数据；通胀承认官方月频天然滞后，但需要显示最新官方月份并优先叠加 Cleveland Fed nowcast；政策定价和资产价格若缺失，会降低结论置信度。
        </p>
      </div>
    </details>
  );
}

function sourceLabel(source: DataSource): string {
  const labels: Record<DataSource, string> = {
    fred: "FRED",
    "fred+market": "FRED + 市场/政策补充",
    "fred+nowcast": "FRED + 通胀 Nowcast",
    "fred+market+nowcast": "FRED + 市场/政策补充 + 通胀 Nowcast",
    partial: "部分 FRED + 模拟数据",
    "partial+nowcast": "部分 FRED + 模拟数据 + 通胀 Nowcast",
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
  const tone = warning
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-zinc-200 bg-white text-zinc-600";

  return (
    <section className={`rounded-lg border p-4 text-sm leading-6 shadow-sm ${tone}`}>
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

function DataQualityPanel({ report }: { report: DataQualityReport }) {
  const tone = dataQualityTone[report.status];

  return (
    <details className="group rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">
              数据检验
            </p>
            <span
              className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${tone.className}`}
            >
              {tone.label}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-zinc-950">
            {report.summary}
          </p>
        </div>
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200 group-open:hidden">
          查看
        </span>
        <span className="hidden rounded-md bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline-flex">
          收起
        </span>
      </summary>
      <div className="mt-4 grid gap-2 border-t border-zinc-200 pt-4 md:grid-cols-2">
        {report.items.map((item) => (
          <div key={item.label} className="rounded-md bg-zinc-50 p-3 ring-1 ring-black/[0.04]">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-950">{item.label}</p>
              <span
                className={`font-mono text-[11px] font-semibold ${dataQualityItemTone(
                  item.status,
                )}`}
              >
                {dataQualityStatusLabel[item.status]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{item.detail}</p>
            <p className="mt-2 text-[11px] leading-5 text-zinc-400">
              {item.source}
              {item.latestDate ? ` / ${item.latestDate}` : ""}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function Home() {
  const data = await getDashboardData();
  const radar = calculateRateCutRadar(
    data.series,
    data.inflationNowcast,
    data.marketContext,
  );
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

        <DecisionHero
          radar={radar}
          dataQuality={data.dataQuality}
          executiveSummary={executiveSummary}
        />

        <DataQualityPanel report={data.dataQuality} />

        <DataNotice warning={data.warning} notices={data.notices} />

        <PolicyPricingCard marketContext={data.marketContext} />

        <DailyBrief brief={brief} />

        <WhatChangedToday radar={radar} />

        <section className="grid gap-4 md:grid-cols-3">
          <SignalCard signal={radar.signals.oil} />
          <SignalCard signal={radar.signals.inflation} />
          <SignalCard signal={radar.signals.bond} />
        </section>

        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500">
              健康校验
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              区分健康降息和压力降息
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SignalCard signal={radar.signals.labor} />
            <SignalCard signal={radar.signals.credit} />
            <SignalCard signal={radar.signals.inflationExpectations} />
          </div>
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
