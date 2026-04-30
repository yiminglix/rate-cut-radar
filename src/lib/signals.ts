import type {
  DashboardSeries,
  RateCutRadar,
  RadarStatus,
  SeriesPoint,
  SignalColor,
  SignalResult,
} from "./types";

const OIL_WEIGHT = 30;
const INFLATION_WEIGHT = 35;
const BOND_WEIGHT = 35;

function validPoints(points: SeriesPoint[]): SeriesPoint[] {
  return points.filter((point) => Number.isFinite(point.value));
}

function latest(points: SeriesPoint[]): SeriesPoint | undefined {
  return validPoints(points).at(-1);
}

function scoreFor(color: SignalColor, maxScore: number): number {
  if (color === "green") return maxScore;
  if (color === "yellow") return maxScore / 2;
  return 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatBps(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${round(value, 1)} bps`;
}

function calculateOilSignal(points: SeriesPoint[]): SignalResult {
  const clean = validPoints(points);
  const latestPoint = clean.at(-1);

  if (!latestPoint || clean.length < 20) {
    return {
      name: "oil",
      title: "Oil Signal",
      color: "yellow",
      score: scoreFor("yellow", OIL_WEIGHT),
      maxScore: OIL_WEIGHT,
      summary: "Brent 数据不足，油价信号暂按中性处理。",
      details: { dataPoints: clean.length },
    };
  }

  const last20 = clean.slice(-20);
  const current = latestPoint.value;
  const high20 = Math.max(...last20.map((point) => point.value));
  const average20 =
    last20.reduce((sum, point) => sum + point.value, 0) / last20.length;
  const pullbackPct = ((high20 - current) / high20) * 100;

  let color: SignalColor = "red";
  if (pullbackPct >= 10 && current < average20) {
    color = "green";
  } else if (pullbackPct >= 3 && pullbackPct < 10) {
    color = "yellow";
  }

  const summary =
    color === "green"
      ? "Brent 已明显脱离近 20 个交易日高点，并低于 20 日均线，油价开始配合降息叙事。"
      : color === "yellow"
        ? "Brent 有所回落，但幅度还不够深，油价只是在边际上支持降息预期。"
        : "Brent 接近近期高点或回落不足，能源价格仍可能干扰降息预期。";

  return {
    name: "oil",
    title: "Oil Signal",
    color,
    score: scoreFor(color, OIL_WEIGHT),
    maxScore: OIL_WEIGHT,
    summary,
    details: {
      current: round(current, 2),
      high20: round(high20, 2),
      average20: round(average20, 2),
      pullbackPct: round(pullbackPct, 1),
    },
  };
}

function changeOverFiveSessions(points: SeriesPoint[]): {
  current: number;
  previous: number;
  changeBps: number;
} | null {
  const clean = validPoints(points);
  if (clean.length < 6) return null;

  const current = clean.at(-1)?.value;
  const previous = clean.at(-6)?.value;
  if (current === undefined || previous === undefined) return null;

  return {
    current,
    previous,
    changeBps: (current - previous) * 100,
  };
}

function calculateBondSignal(series: DashboardSeries): SignalResult {
  const twoYear = changeOverFiveSessions(series.DGS2);
  const tenYear = changeOverFiveSessions(series.DGS10);
  const thirtyYear = changeOverFiveSessions(series.DGS30);

  if (!twoYear || !tenYear || !thirtyYear) {
    return {
      name: "bond",
      title: "Bond Market Signal",
      color: "yellow",
      score: scoreFor("yellow", BOND_WEIGHT),
      maxScore: BOND_WEIGHT,
      summary: "美债数据不足，债券市场信号暂按中性处理。",
      details: {},
    };
  }

  const twoYearDown = twoYear.changeBps <= -3;
  const longEndFlatOrDown =
    tenYear.changeBps <= 3 && thirtyYear.changeBps <= 3;
  const longEndClearlyUp =
    tenYear.changeBps >= 5 || thirtyYear.changeBps >= 5;
  const politicalCutRisk = twoYearDown && longEndClearlyUp;

  let color: SignalColor = "yellow";
  if (twoYearDown && longEndFlatOrDown) color = "green";
  if (politicalCutRisk) color = "red";

  const summary =
    color === "green"
      ? "短端利率下行，同时 10Y/30Y 没有明显上行，债券市场正在认可更健康的降息路径。"
      : color === "red"
        ? "2Y 下行但长端收益率明显上行，市场更像在定价政治化降息或期限溢价压力。"
        : "美债曲线信号仍不充分，短端与长端还没有形成一致的降息确认。";

  return {
    name: "bond",
    title: "Bond Market Signal",
    color,
    score: scoreFor(color, BOND_WEIGHT),
    maxScore: BOND_WEIGHT,
    summary,
    details: {
      twoYearChange: formatBps(twoYear.changeBps),
      tenYearChange: formatBps(tenYear.changeBps),
      thirtyYearChange: formatBps(thirtyYear.changeBps),
      politicalCutRisk,
    },
  };
}

function corePceMomentum(points: SeriesPoint[]): {
  previousMomentum: number;
  latestMomentum: number;
} | null {
  const clean = validPoints(points).slice(-3);
  if (clean.length < 3) return null;

  const [first, second, third] = clean;
  return {
    previousMomentum: ((second.value - first.value) / first.value) * 100,
    latestMomentum: ((third.value - second.value) / second.value) * 100,
  };
}

function trimmedPceMomentum(points: SeriesPoint[]): {
  previousMomentum: number;
  latestMomentum: number;
} | null {
  const clean = validPoints(points).slice(-3);
  if (clean.length < 3) return null;

  return {
    previousMomentum: clean[1].value,
    latestMomentum: clean[2].value,
  };
}

function calculateInflationSignal(series: DashboardSeries): SignalResult {
  const core = corePceMomentum(series.PCEPILFE);
  const trimmed = trimmedPceMomentum(series.PCETRIM1M158SFRBDAL);

  if (!core || !trimmed) {
    return {
      name: "inflation",
      title: "Inflation Signal",
      color: "yellow",
      score: scoreFor("yellow", INFLATION_WEIGHT),
      maxScore: INFLATION_WEIGHT,
      summary: "PCE 数据不足，通胀信号暂按中性处理。",
      details: {},
    };
  }

  const coreSlowing = core.latestMomentum < core.previousMomentum;
  const trimmedSlowing = trimmed.latestMomentum < trimmed.previousMomentum;
  const slowingCount = Number(coreSlowing) + Number(trimmedSlowing);

  let color: SignalColor = "red";
  if (slowingCount === 2) color = "green";
  if (slowingCount === 1) color = "yellow";

  const summary =
    color === "green"
      ? "核心 PCE 动能和 Trimmed Mean PCE 同步放缓，通胀端正在支持更干净的降息预期。"
      : color === "yellow"
        ? "通胀数据有一项放缓、一项仍偏黏，降息预期获得部分支持但还不稳。"
        : "核心 PCE 与 Trimmed Mean PCE 未能放缓，通胀端暂不支持健康降息叙事。";

  return {
    name: "inflation",
    title: "Inflation Signal",
    color,
    score: scoreFor(color, INFLATION_WEIGHT),
    maxScore: INFLATION_WEIGHT,
    summary,
    details: {
      coreLatestMomentum: round(core.latestMomentum, 3),
      corePreviousMomentum: round(core.previousMomentum, 3),
      trimmedLatestMomentum: round(trimmed.latestMomentum, 2),
      trimmedPreviousMomentum: round(trimmed.previousMomentum, 2),
      coreSlowing,
      trimmedSlowing,
    },
  };
}

function calculateScore(signals: {
  oil: SignalResult;
  inflation: SignalResult;
  bond: SignalResult;
}): number {
  return Math.round(
    signals.oil.score + signals.inflation.score + signals.bond.score,
  );
}

function dropLatest(points: SeriesPoint[]): SeriesPoint[] {
  return points.slice(0, -1);
}

function calculateSignals(series: DashboardSeries) {
  return {
    oil: calculateOilSignal(series.DCOILBRENTEU),
    inflation: calculateInflationSignal(series),
    bond: calculateBondSignal(series),
  };
}

function statusForScore(score: number, politicalCutRisk: boolean): RadarStatus {
  if (politicalCutRisk) return "Political Cut Risk";
  if (score >= 80) return "Healthy Rate Cut Expectation";
  if (score >= 60) return "Rate Cut Expectation Warming";
  if (score >= 40) return "Mixed / Wait and See";
  if (score >= 20) return "Rate Cut Expectation Weak";
  return "Rate Cut Expectation Failed";
}

function statusSummary(status: RadarStatus): string {
  const summaries: Record<RadarStatus, string> = {
    "Healthy Rate Cut Expectation":
      "油价、通胀和美债同时配合，健康降息预期正在形成。",
    "Rate Cut Expectation Warming":
      "降息预期正在升温，但仍需要更多通胀或长端利率确认。",
    "Mixed / Wait and See":
      "信号仍然分裂，降息交易处于修复但不健康状态。",
    "Rate Cut Expectation Weak":
      "关键宏观信号支持不足，降息预期偏弱。",
    "Political Cut Risk":
      "短端押注降息，但长端美债尚未买账，政治化降息风险上升。",
    "Rate Cut Expectation Failed":
      "油价、通胀或债券市场没有形成配合，降息预期暂时失败。",
  };

  return summaries[status];
}

export function calculateRateCutRadar(series: DashboardSeries): RateCutRadar {
  const signals = calculateSignals(series);
  const score = calculateScore(signals);

  const previousDailySeries: DashboardSeries = {
    ...series,
    DCOILBRENTEU: dropLatest(series.DCOILBRENTEU),
    DGS2: dropLatest(series.DGS2),
    DGS10: dropLatest(series.DGS10),
    DGS30: dropLatest(series.DGS30),
    T10Y2Y: dropLatest(series.T10Y2Y),
  };
  const previousSignals = calculateSignals(previousDailySeries);
  const previousScore = calculateScore(previousSignals);

  const politicalCutRisk = signals.bond.details.politicalCutRisk === true;
  const status = statusForScore(score, politicalCutRisk);

  return {
    score,
    previousScore,
    scoreDelta: score - previousScore,
    status,
    statusSummary: statusSummary(status),
    signals,
    politicalCutRisk,
  };
}

export function getLatestPoint(points: SeriesPoint[]): SeriesPoint | undefined {
  return latest(points);
}
