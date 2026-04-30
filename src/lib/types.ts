export type FredSeriesId =
  | "DGS2"
  | "DGS10"
  | "DGS30"
  | "T10Y2Y"
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
  frequency: "daily" | "monthly";
};

export type DashboardSeries = Record<FredSeriesId, SeriesPoint[]>;

export type DataSource = "fred" | "mock";

export type DashboardData = {
  series: DashboardSeries;
  source: DataSource;
  updatedAt: string;
  warning?: string;
};

export type SignalColor = "green" | "yellow" | "red";

export type SignalName = "oil" | "inflation" | "bond";

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
  };
  politicalCutRisk: boolean;
};
