export type FredSeriesId =
  | "DGS2"
  | "DGS10"
  | "DGS30"
  | "T10Y2Y"
  | "T10YIE"
  | "T5YIFR"
  | "BAMLH0A0HYM2"
  | "ICSA"
  | "PCEPILFE"
  | "PCETRIM1M158SFRBDAL"
  | "DCOILBRENTEU";

export type SeriesPoint = {
  date: string;
  value: number;
};

export type SeriesMeta = {
  id: FredSeriesId;
  name: string;
  shortName: string;
  unit: string;
  frequency: "daily" | "weekly" | "monthly";
};

export type DashboardSeries = Record<FredSeriesId, SeriesPoint[]>;

export type DataSource =
  | "fred"
  | "fred+market"
  | "fred+nowcast"
  | "fred+market+nowcast"
  | "partial"
  | "partial+nowcast"
  | "mock";

export type InflationNowcastRow = {
  month: string;
  cpi: number;
  coreCpi: number;
  pce: number;
  corePce: number;
  updated: string;
};

export type InflationNowcast = {
  source: "cleveland-fed";
  sourceName: string;
  latestMonth: string;
  previousMonth?: string;
  updated: string;
  monthOverMonth: InflationNowcastRow[];
  yearOverYear: InflationNowcastRow[];
  quarterlyAnnualized?: InflationNowcastRow;
};

export type DashboardData = {
  series: DashboardSeries;
  source: DataSource;
  updatedAt: string;
  warning?: string;
  notices?: string[];
  inflationNowcast?: InflationNowcast;
  marketContext?: MarketContext;
};

export type SignalColor = "green" | "yellow" | "red" | "stale";

export type SignalName =
  | "oil"
  | "inflation"
  | "bond"
  | "labor"
  | "credit"
  | "inflationExpectations";

export type SignalResult = {
  name: SignalName;
  title: string;
  color: SignalColor;
  score: number;
  maxScore: number;
  summary: string;
  details: Record<string, string | number | boolean>;
};

export type RadarStatus =
  | "Healthy Rate Cut Expectation"
  | "Rate Cut Expectation Warming"
  | "Mixed / Wait and See"
  | "Rate Cut Expectation Weak"
  | "Political Cut Risk"
  | "Rate Cut Expectation Failed";

export type ScoreDirection = "up" | "down" | "flat";

export type SignalChange = {
  name: SignalName;
  title: string;
  previousColor: SignalColor;
  currentColor: SignalColor;
  changed: boolean;
  summary: string;
};

export type MarketMove = {
  label: string;
  value: string;
  detail: string;
  tone: "supportive" | "risk" | "neutral";
};

export type WhatChangedToday = {
  scoreDelta: number;
  scoreDirection: ScoreDirection;
  summary: string;
  signalChanges: SignalChange[];
  keyMoves: MarketMove[];
};

export type AssetBias = "bullish" | "neutral" | "bearish" | "volatile";

export type AssetImpact = {
  asset: "恒生科技" | "纳指成长" | "长债/TLT" | "黄金" | "BTC";
  bias: AssetBias;
  summary: string;
};

export type AssetMarketTrend = {
  asset: AssetImpact["asset"];
  symbol: string;
  sourceName: string;
  latestDate: string;
  latestPrice: number;
  oneMonthChangePct: number;
  threeMonthChangePct: number;
  drawdownFromSixMonthHighPct: number;
  trend: "up" | "flat" | "down";
};

export type PolicyPricing = {
  sourceName: string;
  latestDate: string;
  fedFundsFutureSymbol: string;
  fedFundsFuturePrice: number;
  impliedRate: number;
  effectiveFedFundsRate?: number;
  impliedDeltaBps?: number;
  stance: "cut" | "neutral" | "hike" | "unknown";
  cmeFedWatchUrl: string;
  note: string;
};

export type MarketContext = {
  assetTrends: AssetMarketTrend[];
  policyPricing?: PolicyPricing;
  notices: string[];
};

export type RateCutRadar = {
  score: number;
  previousScore: number;
  scoreDelta: number;
  status: RadarStatus;
  statusSummary: string;
  signals: {
    oil: SignalResult;
    inflation: SignalResult;
    bond: SignalResult;
    labor: SignalResult;
    credit: SignalResult;
    inflationExpectations: SignalResult;
  };
  signalChanges: SignalChange[];
  whatChanged: WhatChangedToday;
  keyMetrics: MarketMove[];
  assetImpact: AssetImpact[];
  assetImpactSummary: string;
  politicalCutRisk: boolean;
  healthStressRisk: boolean;
  policyPricingRisk: boolean;
};
