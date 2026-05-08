import type {
  AssetBias,
  AssetImpact,
  DashboardSeries,
  InflationNowcast,
  MarketMove,
  RateCutRadar,
  RadarStatus,
  ScoreDirection,
  SeriesPoint,
  SignalChange,
  SignalColor,
  SignalName,
  SignalResult,
} from "./types";

const OIL_WEIGHT = 20;
const INFLATION_WEIGHT = 25;
const BOND_WEIGHT = 25;
const LABOR_WEIGHT = 10;
const CREDIT_WEIGHT = 10;
const INFLATION_EXPECTATIONS_WEIGHT = 10;

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
  return `${prefix}${round(value, 1)}基点`;
}

function formatPct(value: number, digits = 2): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${round(value, digits)}%`;
}

function latestPair(points: SeriesPoint[]): {
  current: SeriesPoint;
  previous: SeriesPoint;
} | null {
  const clean = validPoints(points);
  if (clean.length < 2) return null;

  const current = clean.at(-1);
  const previous = clean.at(-2);
  if (!current || !previous) return null;

  return { current, previous };
}

function calculateOilSignal(points: SeriesPoint[]): SignalResult {
  const clean = validPoints(points);
  const latestPoint = clean.at(-1);

  if (!latestPoint || clean.length < 20) {
    return {
      name: "oil",
      title: "油价信号",
      color: "stale",
      score: 0,
      maxScore: OIL_WEIGHT,
      summary: "Brent 数据不足，暂不判断能源通胀压力是否缓和。",
      details: { dataPoints: clean.length, dataStatus: "数据不足" },
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
      ? "Brent 已明显脱离近 20 个交易日高点，并低于 20 日均线，能源通胀压力正在缓和。"
      : color === "yellow"
        ? "Brent 有所回落，但幅度还不够深，油价只是在边际上支持降息预期。"
        : "Brent 接近近期高点或回落不足，能源价格仍可能挤压降息空间。";

  return {
    name: "oil",
    title: "油价信号",
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
      title: "美债信号",
      color: "stale",
      score: 0,
      maxScore: BOND_WEIGHT,
      summary: "美债数据不足，暂不判断债券市场是否相信健康降息。",
      details: { dataStatus: "数据不足" },
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
      ? "2Y 下行，同时 10Y/30Y 没有明显上行，债券市场正在认可更健康的降息路径。"
      : color === "red"
        ? "2Y 下行但长端收益率明显上行，市场更像在定价政治化降息或期限溢价压力。"
        : "美债曲线信号仍不充分，短端降息交易和长端确认还没有一致。";

  return {
    name: "bond",
    title: "美债信号",
    color,
    score: scoreFor(color, BOND_WEIGHT),
    maxScore: BOND_WEIGHT,
    summary,
    details: {
      twoYearChange: formatBps(twoYear.changeBps),
      tenYearChange: formatBps(tenYear.changeBps),
      thirtyYearChange: formatBps(thirtyYear.changeBps),
      twoYearChangeBps: round(twoYear.changeBps, 1),
      tenYearChangeBps: round(tenYear.changeBps, 1),
      thirtyYearChangeBps: round(thirtyYear.changeBps, 1),
      politicalCutRisk,
    },
  };
}

function average(points: SeriesPoint[]): number {
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function formatClaims(value: number): string {
  return `${Math.round(value / 1_000)}k`;
}

function calculateLaborSignal(points: SeriesPoint[]): SignalResult {
  const clean = validPoints(points);
  const latestPoint = clean.at(-1);

  if (!latestPoint || clean.length < 8) {
    return {
      name: "labor",
      title: "劳动力信号",
      color: "stale",
      score: 0,
      maxScore: LABOR_WEIGHT,
      summary: "初请失业金数据不足，暂不判断就业是否温和降温。",
      details: { dataPoints: clean.length, dataStatus: "数据不足" },
    };
  }

  const recent4 = clean.slice(-4);
  const previous4 = clean.slice(-8, -4);
  const recentAverage = average(recent4);
  const previousAverage = average(previous4);
  const fourWeekChangePct =
    ((recentAverage - previousAverage) / previousAverage) * 100;
  const current = latestPoint.value;
  const recessionStress = current >= 260_000 || fourWeekChangePct >= 12;
  const healthyCooling =
    current < 260_000 && fourWeekChangePct >= 2 && fourWeekChangePct < 12;

  let color: SignalColor = "yellow";
  if (healthyCooling) color = "green";
  if (recessionStress) color = "red";

  const summary =
    color === "green"
      ? "初请失业金温和走高但未失控，就业在降温而不是突然恶化，支持健康降息。"
      : color === "red"
        ? "初请失业金快速上行或已进入压力区，降息可能更像衰退式防守。"
        : "就业信号还不够配合：劳动力市场仍偏稳，或降温幅度尚未形成健康确认。";

  return {
    name: "labor",
    title: "劳动力信号",
    color,
    score: scoreFor(color, LABOR_WEIGHT),
    maxScore: LABOR_WEIGHT,
    summary,
    details: {
      currentClaims: Math.round(current),
      currentClaimsLabel: formatClaims(current),
      recent4wAverage: Math.round(recentAverage),
      recent4wAverageLabel: formatClaims(recentAverage),
      previous4wAverage: Math.round(previousAverage),
      previous4wAverageLabel: formatClaims(previousAverage),
      fourWeekChangePct: round(fourWeekChangePct, 1),
      latestDate: latestPoint.date,
      recessionStress,
    },
  };
}

function calculateCreditSignal(points: SeriesPoint[]): SignalResult {
  const spread = changeOverFiveSessions(points);

  if (!spread) {
    return {
      name: "credit",
      title: "信用压力",
      color: "stale",
      score: 0,
      maxScore: CREDIT_WEIGHT,
      summary: "高收益债利差数据不足，暂不判断降息是否来自信用压力。",
      details: { dataStatus: "数据不足" },
    };
  }

  const fiveDayChangeBps = spread.changeBps;
  const level = spread.current;
  const calmCredit = level <= 3.5 && fiveDayChangeBps <= 20;
  const creditStress = level >= 4.5 || fiveDayChangeBps >= 50;

  let color: SignalColor = "yellow";
  if (calmCredit) color = "green";
  if (creditStress) color = "red";

  const summary =
    color === "green"
      ? "高收益债利差低位稳定，信用市场没有把降息交易理解成危机。"
      : color === "red"
        ? "高收益债利差明显走阔，市场正在给企业信用风险重新定价。"
        : "信用市场暂未拉响警报，但利差确认度还不够强。";

  return {
    name: "credit",
    title: "信用压力",
    color,
    score: scoreFor(color, CREDIT_WEIGHT),
    maxScore: CREDIT_WEIGHT,
    summary,
    details: {
      highYieldOas: round(level, 2),
      highYieldOasChange: formatBps(fiveDayChangeBps),
      highYieldOasChangeBps: round(fiveDayChangeBps, 1),
      creditStress,
    },
  };
}

function calculateInflationExpectationsSignal(
  series: DashboardSeries,
): SignalResult {
  const fiveYearForward = changeOverFiveSessions(series.T5YIFR);
  const tenYearBreakeven = changeOverFiveSessions(series.T10YIE);

  if (!fiveYearForward || !tenYearBreakeven) {
    return {
      name: "inflationExpectations",
      title: "通胀预期",
      color: "stale",
      score: 0,
      maxScore: INFLATION_EXPECTATIONS_WEIGHT,
      summary: "通胀预期数据不足，暂不判断市场是否担心再通胀。",
      details: { dataStatus: "数据不足" },
    };
  }

  const fiveYearChangeBps = fiveYearForward.changeBps;
  const tenYearChangeBps = tenYearBreakeven.changeBps;
  const anchored =
    fiveYearForward.current <= 2.35 &&
    tenYearBreakeven.current <= 2.6 &&
    fiveYearChangeBps <= 5 &&
    tenYearChangeBps <= 8;
  const unanchored =
    fiveYearForward.current >= 2.55 ||
    tenYearBreakeven.current >= 2.8 ||
    fiveYearChangeBps >= 15 ||
    tenYearChangeBps >= 20;

  let color: SignalColor = "yellow";
  if (anchored) color = "green";
  if (unanchored) color = "red";

  const summary =
    color === "green"
      ? "5Y5Y 与 10Y breakeven 没有明显上行，市场通胀预期仍被锚住。"
      : color === "red"
        ? "通胀预期上行过快，降息交易可能重新撞上再通胀风险。"
        : "通胀预期没有失控，但还需要继续观察油价和长端美债的配合。";

  return {
    name: "inflationExpectations",
    title: "通胀预期",
    color,
    score: scoreFor(color, INFLATION_EXPECTATIONS_WEIGHT),
    maxScore: INFLATION_EXPECTATIONS_WEIGHT,
    summary,
    details: {
      fiveYearForward: round(fiveYearForward.current, 2),
      fiveYearForwardChange: formatBps(fiveYearChangeBps),
      fiveYearForwardChangeBps: round(fiveYearChangeBps, 1),
      tenYearBreakeven: round(tenYearBreakeven.current, 2),
      tenYearBreakevenChange: formatBps(tenYearChangeBps),
      tenYearBreakevenChangeBps: round(tenYearChangeBps, 1),
      unanchored,
    },
  };
}

function annualizedFromIndex(
  current: number,
  previous: number,
  months: number,
): number {
  return (Math.pow(current / previous, 12 / months) - 1) * 100;
}

function corePceYoy(points: SeriesPoint[]): {
  previous: number;
  latest: number;
} | null {
  const clean = validPoints(points);
  if (clean.length < 14) return null;

  const latestPoint = clean.at(-1);
  const latestYearAgo = clean.at(-13);
  const previousPoint = clean.at(-2);
  const previousYearAgo = clean.at(-14);
  if (!latestPoint || !latestYearAgo || !previousPoint || !previousYearAgo) {
    return null;
  }

  return {
    latest: ((latestPoint.value / latestYearAgo.value) - 1) * 100,
    previous: ((previousPoint.value / previousYearAgo.value) - 1) * 100,
  };
}

function corePceThreeMonthAnnualized(points: SeriesPoint[]): {
  previous: number;
  latest: number;
} | null {
  const clean = validPoints(points);
  if (clean.length < 5) return null;

  const latestPoint = clean.at(-1);
  const latestThreeMonthsAgo = clean.at(-4);
  const previousPoint = clean.at(-2);
  const previousThreeMonthsAgo = clean.at(-5);
  if (
    !latestPoint ||
    !latestThreeMonthsAgo ||
    !previousPoint ||
    !previousThreeMonthsAgo
  ) {
    return null;
  }

  return {
    latest: annualizedFromIndex(latestPoint.value, latestThreeMonthsAgo.value, 3),
    previous: annualizedFromIndex(
      previousPoint.value,
      previousThreeMonthsAgo.value,
      3,
    ),
  };
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

function trimmedMeanSixMonthAnnualized(points: SeriesPoint[]): {
  previous: number;
  latest: number;
} | null {
  const clean = validPoints(points);
  if (clean.length < 7) return null;

  const latestWindow = clean.slice(-6);
  const previousWindow = clean.slice(-7, -1);
  const latestValue = annualizedTrimmedWindow(latestWindow);
  const previousValue = annualizedTrimmedWindow(previousWindow);

  if (latestValue === null || previousValue === null) return null;

  return {
    latest: latestValue,
    previous: previousValue,
  };
}

function calculateInflationSignal(
  series: DashboardSeries,
  nowcast?: InflationNowcast,
): SignalResult {
  const coreLatest = latest(series.PCEPILFE);
  const trimmedLatest = latest(series.PCETRIM1M158SFRBDAL);
  const coreYoy = corePceYoy(series.PCEPILFE);
  const coreThreeMonth = corePceThreeMonthAnnualized(series.PCEPILFE);
  const trimmedSixMonth = trimmedMeanSixMonthAnnualized(
    series.PCETRIM1M158SFRBDAL,
  );

  if (!coreYoy || !coreThreeMonth || !trimmedSixMonth) {
    return {
      name: "inflation",
      title: "通胀信号",
      color: "stale",
      score: 0,
      maxScore: INFLATION_WEIGHT,
      summary:
        "PCE 数据不足，暂不判断底层通胀是否放缓，避免用指数水平误判通胀方向。",
      details: {
        corePceDataPoints: validPoints(series.PCEPILFE).length,
        trimmedMeanDataPoints: validPoints(series.PCETRIM1M158SFRBDAL).length,
        corePceLatestDate: coreLatest?.date ?? "数据不足",
        trimmedMeanLatestDate: trimmedLatest?.date ?? "数据不足",
        dataStatus: "数据不足",
      },
    };
  }

  const coreYoySlowing = coreYoy.latest < coreYoy.previous;
  const coreThreeMonthSlowing = coreThreeMonth.latest < coreThreeMonth.previous;
  const trimmedSixMonthSlowing =
    trimmedSixMonth.latest < trimmedSixMonth.previous;
  const slowingCount =
    Number(coreYoySlowing) +
    Number(coreThreeMonthSlowing) +
    Number(trimmedSixMonthSlowing);
  const nowcastMom = nowcast?.monthOverMonth[0];
  const previousNowcastMom = nowcast?.monthOverMonth[1];
  const nowcastYoy = nowcast?.yearOverYear[0];
  const previousNowcastYoy = nowcast?.yearOverYear[1];
  const nowcastCorePceMomAnnualized = nowcastMom
    ? (Math.pow(1 + nowcastMom.corePce / 100, 12) - 1) * 100
    : null;
  const nowcastCorePceMomSlowing =
    nowcastMom && previousNowcastMom
      ? nowcastMom.corePce <= previousNowcastMom.corePce
      : null;
  const nowcastCorePceYoySlowing =
    nowcastYoy && previousNowcastYoy
      ? nowcastYoy.corePce <= previousNowcastYoy.corePce
      : null;
  const nowcastSticky =
    nowcastCorePceMomSlowing === false && nowcastCorePceYoySlowing === false;

  let color: SignalColor = "red";
  if (slowingCount === 3) color = "green";
  if (slowingCount >= 1 && slowingCount < 3) color = "yellow";
  if (color === "green" && nowcastSticky) color = "yellow";

  const nowcastSummary = nowcastMom
    ? `Cleveland Fed nowcast 已补到 ${nowcast.latestMonth}，Core PCE MoM 约 ${nowcastMom.corePce}%，折年约 ${
        nowcastCorePceMomAnnualized === null
          ? "N/A"
          : `${round(nowcastCorePceMomAnnualized, 2)}%`
      }。`
    : "";
  const baseSummary =
    color === "green"
      ? "Core PCE YoY、Core PCE 3M 年化和 Trimmed Mean PCE 6M 年化同步放缓，底层通胀正在自然降温。"
      : color === "yellow"
        ? "底层通胀只有部分指标放缓，降息空间在改善，但通胀黏性还没有完全解除。"
        : "Core PCE 和 Trimmed Mean PCE 的关键动能未放缓，通胀端暂不支持健康降息叙事。";
  const summary = `${baseSummary}${nowcastSummary ? ` ${nowcastSummary}` : ""}`;

  return {
    name: "inflation",
    title: "通胀信号",
    color,
    score: scoreFor(color, INFLATION_WEIGHT),
    maxScore: INFLATION_WEIGHT,
    summary,
    details: {
      corePceYoy: round(coreYoy.latest, 2),
      previousCorePceYoy: round(coreYoy.previous, 2),
      corePceThreeMonthAnnualized: round(coreThreeMonth.latest, 2),
      previousCorePceThreeMonthAnnualized: round(coreThreeMonth.previous, 2),
      trimmedMeanSixMonthAnnualized: round(trimmedSixMonth.latest, 2),
      previousTrimmedMeanSixMonthAnnualized: round(trimmedSixMonth.previous, 2),
      corePceLatestDate: coreLatest?.date ?? "数据不足",
      trimmedMeanLatestDate: trimmedLatest?.date ?? "数据不足",
      nowcastSource: nowcast?.sourceName ?? "未接入",
      nowcastUpdated: nowcast?.updated ?? "数据不足",
      nowcastLatestMonth: nowcast?.latestMonth ?? "数据不足",
      nowcastCorePceMom: nowcastMom ? round(nowcastMom.corePce, 2) : "数据不足",
      nowcastCorePceYoy: nowcastYoy ? round(nowcastYoy.corePce, 2) : "数据不足",
      nowcastCorePceMomAnnualized:
        nowcastCorePceMomAnnualized === null
          ? "数据不足"
          : round(nowcastCorePceMomAnnualized, 2),
      nowcastCorePceMomSlowing: nowcastCorePceMomSlowing ?? "数据不足",
      nowcastCorePceYoySlowing: nowcastCorePceYoySlowing ?? "数据不足",
      nowcastSticky,
      coreYoySlowing,
      coreThreeMonthSlowing,
      trimmedSixMonthSlowing,
    },
  };
}

function calculateScore(signals: {
  oil: SignalResult;
  inflation: SignalResult;
  bond: SignalResult;
  labor: SignalResult;
  credit: SignalResult;
  inflationExpectations: SignalResult;
}): number {
  return Math.round(
    signals.oil.score +
      signals.inflation.score +
      signals.bond.score +
      signals.labor.score +
      signals.credit.score +
      signals.inflationExpectations.score,
  );
}

function dropLatest(points: SeriesPoint[]): SeriesPoint[] {
  return points.slice(0, -1);
}

function calculateSignals(series: DashboardSeries, nowcast?: InflationNowcast) {
  return {
    oil: calculateOilSignal(series.DCOILBRENTEU),
    inflation: calculateInflationSignal(series, nowcast),
    bond: calculateBondSignal(series),
    labor: calculateLaborSignal(series.ICSA),
    credit: calculateCreditSignal(series.BAMLH0A0HYM2),
    inflationExpectations: calculateInflationExpectationsSignal(series),
  };
}

const signalTitles: Record<SignalName, string> = {
  oil: "油价信号",
  inflation: "通胀信号",
  bond: "美债信号",
  labor: "劳动力信号",
  credit: "信用压力",
  inflationExpectations: "通胀预期",
};

function colorLabel(color: SignalColor, name?: SignalName): string {
  if (color === "green") return "已确认";
  if (color === "yellow") return "未确认";
  if (color === "red") return name === "inflation" ? "偏粘" : "风险";
  return "数据不足";
}

function colorRank(color: SignalColor): number {
  if (color === "green") return 3;
  if (color === "yellow") return 2;
  if (color === "red") return 1;
  return 0;
}

function signalChangeSummary(
  name: SignalName,
  title: string,
  previousColor: SignalColor,
  currentColor: SignalColor,
): string {
  if (previousColor === currentColor) {
    return `${title}维持${colorLabel(currentColor, name)}。`;
  }

  const better = colorRank(currentColor) > colorRank(previousColor);

  return `${title}由${colorLabel(previousColor, name)}变为${colorLabel(
    currentColor,
    name,
  )}，${better ? "对降息健康度更友好" : "确认力度减弱"}。`;
}

function buildSignalChanges(
  current: ReturnType<typeof calculateSignals>,
  previous: ReturnType<typeof calculateSignals>,
): SignalChange[] {
  return (
    [
      "oil",
      "inflation",
      "bond",
      "labor",
      "credit",
      "inflationExpectations",
    ] as SignalName[]
  ).map((name) => {
    const previousColor = previous[name].color;
    const currentColor = current[name].color;

    return {
      name,
      title: signalTitles[name],
      previousColor,
      currentColor,
      changed: previousColor !== currentColor,
      summary: signalChangeSummary(
        name,
        signalTitles[name],
        previousColor,
        currentColor,
      ),
    };
  });
}

function scoreDirection(delta: number): ScoreDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function marketMove(
  label: string,
  change: number | null,
  value: string,
  detail: string,
  supportiveWhenNegative: boolean,
): MarketMove {
  let tone: MarketMove["tone"] = "neutral";

  if (change !== null && Math.abs(change) >= 0.01) {
    const supportive = supportiveWhenNegative ? change < 0 : change > 0;
    tone = supportive ? "supportive" : "risk";
  }

  return { label, value, detail, tone };
}

function buildKeyMoves(series: DashboardSeries): MarketMove[] {
  const oil = latestPair(series.DCOILBRENTEU);
  const twoYear = latestPair(series.DGS2);
  const tenYear = latestPair(series.DGS10);
  const thirtyYear = latestPair(series.DGS30);
  const claims = latestPair(series.ICSA);
  const highYieldOas = latestPair(series.BAMLH0A0HYM2);
  const fiveYearForward = latestPair(series.T5YIFR);

  const oilChangePct = oil
    ? ((oil.current.value - oil.previous.value) / oil.previous.value) * 100
    : null;
  const twoYearBps = twoYear
    ? (twoYear.current.value - twoYear.previous.value) * 100
    : null;
  const tenYearBps = tenYear
    ? (tenYear.current.value - tenYear.previous.value) * 100
    : null;
  const thirtyYearBps = thirtyYear
    ? (thirtyYear.current.value - thirtyYear.previous.value) * 100
    : null;
  const claimsChange = claims ? claims.current.value - claims.previous.value : null;
  const highYieldOasBps = highYieldOas
    ? (highYieldOas.current.value - highYieldOas.previous.value) * 100
    : null;
  const fiveYearForwardBps = fiveYearForward
    ? (fiveYearForward.current.value - fiveYearForward.previous.value) * 100
    : null;
  const claimsTone: MarketMove["tone"] =
    claimsChange === null
      ? "neutral"
      : claimsChange > 20_000
        ? "risk"
        : claimsChange > 0
          ? "supportive"
          : claimsChange < -10_000
            ? "risk"
            : "neutral";

  return [
    marketMove(
      "Brent",
      oilChangePct,
      oilChangePct === null ? "N/A" : formatPct(oilChangePct),
      oil ? `最新 ${round(oil.current.value, 2)} 美元/桶` : "暂无有效油价数据",
      true,
    ),
    marketMove(
      "2Y 美债",
      twoYearBps,
      twoYearBps === null ? "N/A" : formatBps(twoYearBps),
      twoYear ? `最新 ${round(twoYear.current.value, 2)}%` : "暂无有效 2Y 数据",
      true,
    ),
    marketMove(
      "10Y 美债",
      tenYearBps,
      tenYearBps === null ? "N/A" : formatBps(tenYearBps),
      tenYear ? `最新 ${round(tenYear.current.value, 2)}%` : "暂无有效 10Y 数据",
      true,
    ),
    marketMove(
      "30Y 美债",
      thirtyYearBps,
      thirtyYearBps === null ? "N/A" : formatBps(thirtyYearBps),
      thirtyYear ? `最新 ${round(thirtyYear.current.value, 2)}%` : "暂无有效 30Y 数据",
      true,
    ),
    {
      label: "初请失业金",
      value:
        claimsChange === null
          ? "N/A"
          : `${claimsChange > 0 ? "+" : ""}${Math.round(claimsChange / 1_000)}k`,
      detail: claims
        ? `最新 ${formatClaims(claims.current.value)}`
        : "暂无有效初请数据",
      tone: claimsTone,
    },
    marketMove(
      "HY OAS",
      highYieldOasBps,
      highYieldOasBps === null ? "N/A" : formatBps(highYieldOasBps),
      highYieldOas
        ? `最新 ${round(highYieldOas.current.value, 2)}%`
        : "暂无有效信用利差数据",
      true,
    ),
    marketMove(
      "5Y5Y 通胀预期",
      fiveYearForwardBps,
      fiveYearForwardBps === null ? "N/A" : formatBps(fiveYearForwardBps),
      fiveYearForward
        ? `最新 ${round(fiveYearForward.current.value, 2)}%`
        : "暂无有效通胀预期数据",
      true,
    ),
  ];
}

function moveFromSignalColor(
  label: string,
  value: string,
  detail: string,
  color: SignalColor,
): MarketMove {
  const tone: MarketMove["tone"] =
    color === "green" ? "supportive" : color === "red" ? "risk" : "neutral";
  return { label, value, detail, tone };
}

function buildKeyMetrics(
  series: DashboardSeries,
  signals: ReturnType<typeof calculateSignals>,
): MarketMove[] {
  const twoYear = changeOverFiveSessions(series.DGS2);
  const tenYear = changeOverFiveSessions(series.DGS10);
  const thirtyYear = changeOverFiveSessions(series.DGS30);
  const coreLatestDate = signals.inflation.details.corePceLatestDate;
  const trimmedLatestDate = signals.inflation.details.trimmedMeanLatestDate;

  return [
    moveFromSignalColor(
      "Brent 距20日高点回撤",
      signals.oil.details.pullbackPct === undefined
        ? "数据不足"
        : `${signals.oil.details.pullbackPct}%`,
      signals.oil.details.high20 === undefined
        ? "需要至少 20 个有效交易日"
        : `20日高点 ${signals.oil.details.high20}`,
      signals.oil.color,
    ),
    marketMove(
      "2Y 5日变化",
      twoYear?.changeBps ?? null,
      twoYear ? formatBps(twoYear.changeBps) : "数据不足",
      twoYear ? `当前 ${round(twoYear.current, 2)}%` : "需要至少 6 个有效交易日",
      true,
    ),
    marketMove(
      "10Y 5日变化",
      tenYear?.changeBps ?? null,
      tenYear ? formatBps(tenYear.changeBps) : "数据不足",
      tenYear ? `当前 ${round(tenYear.current, 2)}%` : "需要至少 6 个有效交易日",
      true,
    ),
    marketMove(
      "30Y 5日变化",
      thirtyYear?.changeBps ?? null,
      thirtyYear ? formatBps(thirtyYear.changeBps) : "数据不足",
      thirtyYear ? `当前 ${round(thirtyYear.current, 2)}%` : "需要至少 6 个有效交易日",
      true,
    ),
    moveFromSignalColor(
      "Core PCE YoY",
      signals.inflation.details.corePceYoy === undefined
        ? "数据不足"
        : `${signals.inflation.details.corePceYoy}%`,
      signals.inflation.details.previousCorePceYoy === undefined
        ? "需要至少 14 个月 Core PCE"
        : `最新官方月份 ${coreLatestDate ?? "未知"}，前值 ${
            signals.inflation.details.previousCorePceYoy
          }%`,
      signals.inflation.color,
    ),
    moveFromSignalColor(
      "Trimmed Mean PCE 6M年化",
      signals.inflation.details.trimmedMeanSixMonthAnnualized === undefined
        ? "数据不足"
        : `${signals.inflation.details.trimmedMeanSixMonthAnnualized}%`,
      signals.inflation.details.previousTrimmedMeanSixMonthAnnualized === undefined
        ? "需要至少 7 个月 Trimmed Mean PCE"
        : `最新官方月份 ${trimmedLatestDate ?? "未知"}，前值 ${
            signals.inflation.details.previousTrimmedMeanSixMonthAnnualized
          }%`,
      signals.inflation.color,
    ),
    moveFromSignalColor(
      "Core PCE nowcast",
      typeof signals.inflation.details.nowcastCorePceMomAnnualized === "number"
        ? `${signals.inflation.details.nowcastCorePceMomAnnualized}%`
        : "数据不足",
      typeof signals.inflation.details.nowcastCorePceYoy === "number"
        ? `${signals.inflation.details.nowcastLatestMonth}，YoY ${signals.inflation.details.nowcastCorePceYoy}%`
        : "等待 Cleveland Fed nowcast",
      signals.inflation.details.nowcastSticky === true
        ? "red"
        : signals.inflation.details.nowcastCorePceMomSlowing === true
          ? "green"
          : "yellow",
    ),
    moveFromSignalColor(
      "初请4周均值变化",
      typeof signals.labor.details.fourWeekChangePct === "number"
        ? `${signals.labor.details.fourWeekChangePct}%`
        : "数据不足",
      typeof signals.labor.details.recent4wAverageLabel === "string"
        ? `4周均值 ${signals.labor.details.recent4wAverageLabel}`
        : "需要至少 8 周初请数据",
      signals.labor.color,
    ),
    moveFromSignalColor(
      "HY OAS 5日变化",
      typeof signals.credit.details.highYieldOasChange === "string"
        ? signals.credit.details.highYieldOasChange
        : "数据不足",
      typeof signals.credit.details.highYieldOas === "number"
        ? `当前 ${signals.credit.details.highYieldOas}%`
        : "需要至少 6 个有效交易日",
      signals.credit.color,
    ),
    moveFromSignalColor(
      "5Y5Y通胀预期",
      typeof signals.inflationExpectations.details.fiveYearForward === "number"
        ? `${signals.inflationExpectations.details.fiveYearForward}%`
        : "数据不足",
      typeof signals.inflationExpectations.details.fiveYearForwardChange ===
        "string"
        ? `5日 ${signals.inflationExpectations.details.fiveYearForwardChange}`
        : "需要至少 6 个有效交易日",
      signals.inflationExpectations.color,
    ),
  ];
}

function buildWhatChangedToday(
  score: number,
  previousScore: number,
  signalChanges: SignalChange[],
  keyMoves: MarketMove[],
): RateCutRadar["whatChanged"] {
  const delta = score - previousScore;
  const changedSignals = signalChanges.filter((signal) => signal.changed);
  const direction = scoreDirection(delta);

  const summary =
    direction === "up"
      ? `分数上升 ${delta} 分，宏观组合更接近健康降息。`
      : direction === "down"
        ? `分数下降 ${Math.abs(delta)} 分，降息确认度减弱。`
        : changedSignals.length > 0
          ? "总分持平，但信号结构正在变化。"
          : "总分持平，今天重点是等待进一步确认。";

  return {
    scoreDelta: delta,
    scoreDirection: direction,
    summary,
    signalChanges,
    keyMoves,
  };
}

function impactBiasClass(radar: {
  score: number;
  politicalCutRisk: boolean;
  healthStressRisk: boolean;
  signals: ReturnType<typeof calculateSignals>;
}): {
  riskBeta: AssetBias;
  duration: AssetBias;
  gold: AssetBias;
  btc: AssetBias;
} {
  if (radar.politicalCutRisk) {
    return {
      riskBeta: "volatile",
      duration: "bearish",
      gold: "bullish",
      btc: "volatile",
    };
  }

  if (radar.healthStressRisk) {
    return {
      riskBeta: "bearish",
      duration: radar.signals.bond.color === "green" ? "bullish" : "neutral",
      gold: "bullish",
      btc: "volatile",
    };
  }

  if (radar.score >= 80) {
    return {
      riskBeta: "bullish",
      duration: "bullish",
      gold: radar.signals.inflation.color === "green" ? "neutral" : "bullish",
      btc: "bullish",
    };
  }

  if (radar.score >= 60) {
    return {
      riskBeta: "bullish",
      duration: radar.signals.bond.color === "green" ? "bullish" : "neutral",
      gold: "neutral",
      btc: "volatile",
    };
  }

  if (radar.score >= 40) {
    return {
      riskBeta: "volatile",
      duration: radar.signals.bond.color === "red" ? "bearish" : "neutral",
      gold: "neutral",
      btc: "volatile",
    };
  }

  return {
    riskBeta: "bearish",
    duration: "bearish",
    gold: radar.signals.inflation.color === "red" ? "bullish" : "neutral",
    btc: "bearish",
  };
}

function buildAssetImpact(radar: {
  score: number;
  politicalCutRisk: boolean;
  healthStressRisk: boolean;
  signals: ReturnType<typeof calculateSignals>;
}): AssetImpact[] {
  const bias = impactBiasClass(radar);

  return [
    {
      asset: "恒生科技",
      bias: bias.riskBeta,
      summary:
        bias.riskBeta === "bullish"
          ? "降息健康度改善时，高弹性估值修复对恒生科技更友好。"
          : bias.riskBeta === "volatile"
            ? "短端宽松能带来反弹，但长端不确认会让行情更颠簸。"
            : "油价、通胀或美债未配合，高弹性中国科技仍偏脆弱。",
    },
    {
      asset: "纳指成长",
      bias: bias.riskBeta,
      summary:
        bias.riskBeta === "bullish"
          ? "长端利率压力缓和，有利于 NASDAQ 成长股估值扩张。"
          : bias.riskBeta === "volatile"
            ? "成长股可做战术交易，但长端上行会压制估值。"
            : "降息预期缺少健康确认，暂不适合追高成长久期。",
    },
    {
      asset: "长债/TLT",
      bias: bias.duration,
      summary:
        bias.duration === "bullish"
          ? "美债市场认可降息路径，长久期资产获得更干净顺风。"
          : bias.duration === "neutral"
            ? "短端松动还不够，TLT 需要 10Y/30Y 继续确认。"
            : "长端收益率抗拒下行，追多 TLT 的胜率下降。",
    },
    {
      asset: "黄金",
      bias: bias.gold,
      summary:
        bias.gold === "bullish"
          ? "政治化降息或通胀黏性会增加黄金的避险和对冲价值。"
          : "若真实利率和政策风险没有恶化，黄金不是主线资产。",
    },
    {
      asset: "BTC",
      bias: bias.btc,
      summary:
        bias.btc === "bullish"
          ? "流动性预期与风险偏好同向时，BTC 更容易获得弹性。"
          : bias.btc === "volatile"
            ? "流动性想象有支撑，但美债确认不足会放大波动。"
            : "降息健康度偏弱时，BTC 容易受风险偏好回落拖累。",
    },
  ];
}

function assetImpactSummary(radar: {
  score: number;
  politicalCutRisk: boolean;
  healthStressRisk: boolean;
  healthyStatusReady: boolean;
  signals: ReturnType<typeof calculateSignals>;
}): string {
  if (radar.politicalCutRisk) {
    return "短端押注降息但长端不信，恒科、纳指成长和 BTC 可能高波动，TLT 仍需谨慎。";
  }

  if (radar.healthStressRisk) {
    return "就业或信用压力升温，长债和黄金更占优，恒科、纳指成长与 BTC 需要防波动。";
  }

  if (radar.score >= 80 && !radar.healthyStatusReady) {
    return "降息预期已进入高分区，但通胀或就业确认不足，成长资产偏友好但还不是完全健康顺风。";
  }

  if (radar.score >= 80) {
    return "健康降息预期正在形成，恒科、纳指成长、TLT 与 BTC 的宏观顺风更干净。";
  }

  if (radar.score >= 60) {
    return "降息预期升温但未完全确认，成长资产偏友好，TLT 和 BTC 仍看长端配合。";
  }

  if (radar.score >= 40) {
    return "信号分裂，资产端以战术反弹看待，等待油价、通胀和长端美债同向。";
  }

  return "宏观组合暂不支持健康降息，高弹性资产和长久期资产都需要防守。";
}

function healthyStatusGateFailures(
  signals: ReturnType<typeof calculateSignals>,
): string[] {
  const failures: string[] = [];

  if (signals.bond.color !== "green") {
    failures.push("长端美债尚未确认");
  }

  if (signals.credit.color === "red" || signals.credit.color === "stale") {
    failures.push("信用压力尚未排除");
  }

  if (
    signals.inflationExpectations.color === "red" ||
    signals.inflationExpectations.color === "stale"
  ) {
    failures.push("通胀预期尚未稳定");
  }

  if (signals.oil.color === "red" || signals.oil.color === "stale") {
    failures.push("油价仍有通胀压力");
  }

  if (signals.inflation.color !== "green" && signals.labor.color !== "green") {
    failures.push("通胀或就业至少需要一项确认");
  }

  return failures;
}

function statusForScore(
  score: number,
  politicalCutRisk: boolean,
  healthStressRisk: boolean,
  healthyGateFailures: string[],
): RadarStatus {
  if (politicalCutRisk) return "Political Cut Risk";
  if (healthStressRisk && score >= 60) return "Mixed / Wait and See";
  if (score >= 80 && healthyGateFailures.length === 0) {
    return "Healthy Rate Cut Expectation";
  }
  if (score >= 60) return "Rate Cut Expectation Warming";
  if (score >= 40) return "Mixed / Wait and See";
  if (score >= 20) return "Rate Cut Expectation Weak";
  return "Rate Cut Expectation Failed";
}

function statusSummary(
  status: RadarStatus,
  healthStressRisk: boolean,
  healthyGateFailures: string[],
): string {
  if (healthStressRisk && status === "Mixed / Wait and See") {
    return "降息预期升温，但就业或信用压力也在升温，当前更像需要防守的压力降息。";
  }

  if (
    status === "Rate Cut Expectation Warming" &&
    healthyGateFailures.length > 0
  ) {
    return `总分已经走强，但${healthyGateFailures.join("、")}，先标记为降息预期升温，而不是健康降息。`;
  }

  const summaries: Record<RadarStatus, string> = {
    "Healthy Rate Cut Expectation":
      "油价、底层通胀、美债与健康校验同时配合，健康降息预期正在形成。",
    "Rate Cut Expectation Warming":
      "降息预期正在升温，但仍需要更多通胀或长端利率确认。",
    "Mixed / Wait and See":
      "信号仍然分裂，降息交易处于修复但不够健康状态。",
    "Rate Cut Expectation Weak":
      "关键宏观信号支持不足，降息预期偏弱。",
    "Political Cut Risk":
      "短端押注降息，但长端美债尚未买账，政治化降息风险上升。",
    "Rate Cut Expectation Failed":
      "油价、通胀或债券市场没有形成配合，降息预期暂时失败。",
  };

  return summaries[status];
}

export function calculateRateCutRadar(
  series: DashboardSeries,
  inflationNowcast?: InflationNowcast,
): RateCutRadar {
  const signals = calculateSignals(series, inflationNowcast);
  const score = calculateScore(signals);

  const previousDailySeries: DashboardSeries = {
    ...series,
    DCOILBRENTEU: dropLatest(series.DCOILBRENTEU),
    DGS2: dropLatest(series.DGS2),
    DGS10: dropLatest(series.DGS10),
    DGS30: dropLatest(series.DGS30),
    T10Y2Y: dropLatest(series.T10Y2Y),
    T10YIE: dropLatest(series.T10YIE),
    T5YIFR: dropLatest(series.T5YIFR),
    BAMLH0A0HYM2: dropLatest(series.BAMLH0A0HYM2),
    ICSA: dropLatest(series.ICSA),
  };
  const previousSignals = calculateSignals(previousDailySeries, inflationNowcast);
  const previousScore = calculateScore(previousSignals);

  const politicalCutRisk = signals.bond.details.politicalCutRisk === true;
  const healthStressRisk =
    signals.labor.details.recessionStress === true ||
    signals.credit.details.creditStress === true;
  const healthyGateFailures = healthyStatusGateFailures(signals);
  const healthyStatusReady = healthyGateFailures.length === 0;
  const status = statusForScore(
    score,
    politicalCutRisk,
    healthStressRisk,
    healthyGateFailures,
  );
  const signalChanges = buildSignalChanges(signals, previousSignals);
  const keyMoves = buildKeyMoves(series);
  const keyMetrics = buildKeyMetrics(series, signals);
  const assetImpact = buildAssetImpact({
    score,
    politicalCutRisk,
    healthStressRisk,
    signals,
  });

  return {
    score,
    previousScore,
    scoreDelta: score - previousScore,
    status,
    statusSummary: statusSummary(status, healthStressRisk, healthyGateFailures),
    signals,
    signalChanges,
    whatChanged: buildWhatChangedToday(score, previousScore, signalChanges, keyMoves),
    keyMetrics,
    assetImpact,
    assetImpactSummary: assetImpactSummary({
      score,
      politicalCutRisk,
      healthStressRisk,
      healthyStatusReady,
      signals,
    }),
    politicalCutRisk,
    healthStressRisk,
  };
}

export function getLatestPoint(points: SeriesPoint[]): SeriesPoint | undefined {
  return latest(points);
}
