import type { DashboardSeries, FredSeriesId, SeriesMeta, SeriesPoint } from "./types";

export const SERIES_META: Record<FredSeriesId, SeriesMeta> = {
  DGS2: {
    id: "DGS2",
    name: "2-Year Treasury Constant Maturity Rate",
    shortName: "2Y Treasury",
    unit: "%",
    frequency: "daily",
  },
  DGS10: {
    id: "DGS10",
    name: "10-Year Treasury Constant Maturity Rate",
    shortName: "10Y Treasury",
    unit: "%",
    frequency: "daily",
  },
  DGS30: {
    id: "DGS30",
    name: "30-Year Treasury Constant Maturity Rate",
    shortName: "30Y Treasury",
    unit: "%",
    frequency: "daily",
  },
  T10Y2Y: {
    id: "T10Y2Y",
    name: "10-Year Treasury Minus 2-Year Treasury",
    shortName: "10Y-2Y Spread",
    unit: "ppt",
    frequency: "daily",
  },
  PCEPILFE: {
    id: "PCEPILFE",
    name: "Core PCE Price Index",
    shortName: "Core PCE",
    unit: "index",
    frequency: "monthly",
  },
  PCETRIM1M158SFRBDAL: {
    id: "PCETRIM1M158SFRBDAL",
    name: "Trimmed Mean PCE Inflation Rate",
    shortName: "Trimmed Mean PCE",
    unit: "% annualized",
    frequency: "monthly",
  },
  DCOILBRENTEU: {
    id: "DCOILBRENTEU",
    name: "Brent Crude Oil Price",
    shortName: "Brent Oil",
    unit: "$/bbl",
    frequency: "daily",
  },
};

const dailyDates = [
  "2026-03-26",
  "2026-03-27",
  "2026-03-30",
  "2026-03-31",
  "2026-04-01",
  "2026-04-02",
  "2026-04-03",
  "2026-04-06",
  "2026-04-07",
  "2026-04-08",
  "2026-04-09",
  "2026-04-10",
  "2026-04-13",
  "2026-04-14",
  "2026-04-15",
  "2026-04-16",
  "2026-04-17",
  "2026-04-20",
  "2026-04-21",
  "2026-04-22",
  "2026-04-23",
  "2026-04-24",
  "2026-04-27",
  "2026-04-28",
  "2026-04-29",
  "2026-04-30",
];

const monthlyDates = [
  "2024-11-01",
  "2024-12-01",
  "2025-01-01",
  "2025-02-01",
  "2025-03-01",
  "2025-04-01",
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
];

function points(dates: string[], values: number[]): SeriesPoint[] {
  return dates.map((date, index) => ({ date, value: values[index] }));
}

export const mockDashboardSeries: DashboardSeries = {
  DCOILBRENTEU: points(dailyDates, [
    89.6, 90.4, 91.1, 90.8, 92.3, 93.2, 92.8, 91.6, 90.9, 89.7, 88.2, 86.9,
    85.8, 84.9, 83.5, 82.4, 81.8, 80.7, 79.9, 78.8, 78.1, 77.5, 76.8, 76.1,
    75.6, 75.2,
  ]),
  DGS2: points(dailyDates, [
    4.21, 4.24, 4.23, 4.2, 4.18, 4.16, 4.12, 4.11, 4.09, 4.05, 4.03, 4.0,
    3.98, 3.96, 3.92, 3.89, 3.86, 3.84, 3.81, 3.79, 3.77, 3.75, 3.73, 3.71,
    3.69, 3.67,
  ]),
  DGS10: points(dailyDates, [
    4.38, 4.39, 4.4, 4.37, 4.35, 4.33, 4.31, 4.3, 4.28, 4.25, 4.24, 4.22,
    4.2, 4.19, 4.17, 4.15, 4.13, 4.12, 4.11, 4.09, 4.07, 4.05, 4.04, 4.02,
    4.0, 3.99,
  ]),
  DGS30: points(dailyDates, [
    4.62, 4.63, 4.64, 4.62, 4.59, 4.57, 4.55, 4.55, 4.53, 4.5, 4.49, 4.47,
    4.45, 4.43, 4.41, 4.4, 4.38, 4.37, 4.36, 4.34, 4.33, 4.31, 4.3, 4.29,
    4.27, 4.26,
  ]),
  T10Y2Y: points(dailyDates, [
    0.17, 0.15, 0.17, 0.17, 0.17, 0.17, 0.19, 0.19, 0.19, 0.2, 0.21, 0.22,
    0.22, 0.23, 0.25, 0.26, 0.27, 0.28, 0.3, 0.3, 0.3, 0.3, 0.31, 0.31,
    0.31, 0.32,
  ]),
  PCEPILFE: points(monthlyDates, [
    128.7, 129.02, 129.34, 129.68, 130.03, 130.36,
    130.71, 131.02, 131.36, 131.75, 132.09, 132.41, 132.71, 133.01, 133.29,
    133.54, 133.77, 133.96,
  ]),
  PCETRIM1M158SFRBDAL: points(monthlyDates, [
    3.5, 3.4, 3.35, 3.3, 3.2, 3.15,
    3.1, 3.3, 3.2, 3.4, 3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.45, 2.34,
  ]),
};
