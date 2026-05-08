import { mockDashboardSeries, SERIES_META } from "./mock-data";
import type {
  DashboardData,
  DashboardSeries,
  FredSeriesId,
  InflationNowcast,
  InflationNowcastRow,
  SeriesPoint,
} from "./types";

type FredObservation = {
  date: string;
  value: string;
};

type FredObservationResponse = {
  observations?: FredObservation[];
  error_code?: number;
  error_message?: string;
};

type OilpriceQuote = {
  time?: number | string;
  price?: number | string;
};

type OilpriceLastResponse = Record<string, OilpriceQuote | undefined>;

export const FRED_SERIES_IDS = Object.keys(SERIES_META) as FredSeriesId[];

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const BRENT_OILPRICE_BLEND_ID = "46";
const BRENT_MARKET_DATA_URL =
  "https://s3.amazonaws.com/oilprice.com/widgets/oilprices/all/last.json";
const CLEVELAND_FED_NOWCAST_URL =
  "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting";

class NonRetryableFredError extends Error {}

function dateMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function getObservationMonths(): number {
  const configured = Number(process.env.FRED_OBSERVATION_MONTHS);
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
}

function getRevalidateSeconds(): number {
  const configured = Number(process.env.FRED_REVALIDATE_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : 3_600;
}

function getFredBaseUrl(): string {
  return process.env.FRED_API_BASE_URL ?? "https://api.stlouisfed.org/fred";
}

function getRetryAttempts(): number {
  const configured = Number(process.env.FRED_RETRY_ATTEMPTS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.floor(configured), 5)
    : 3;
}

function getRetryDelayMs(): number {
  const configured = Number(process.env.FRED_RETRY_DELAY_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 750;
}

function getDailyStaleDays(): number {
  const configured = Number(process.env.FRED_DAILY_STALE_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

function getMonthlyStaleDays(): number {
  const configured = Number(process.env.FRED_MONTHLY_STALE_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : 75;
}

function getBrentMarketDataUrl(): string {
  return process.env.BRENT_MARKET_DATA_URL ?? BRENT_MARKET_DATA_URL;
}

function getInflationNowcastUrl(): string {
  return process.env.INFLATION_NOWCAST_URL ?? CLEVELAND_FED_NOWCAST_URL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelay(attempt: number): number {
  return getRetryDelayMs() * attempt;
}

function shouldRetryStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function parseObservations(observations: FredObservation[] = []): SeriesPoint[] {
  return observations
    .map((observation) => ({
      date: observation.date,
      value: Number.parseFloat(observation.value),
    }))
    .filter((point) => Number.isFinite(point.value));
}

function latestPoint(points: SeriesPoint[]): SeriesPoint | undefined {
  return points.filter((point) => Number.isFinite(point.value)).at(-1);
}

function daysSince(dateString: string, now = new Date()): number {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;

  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function isStale(points: SeriesPoint[], maxAgeDays: number): boolean {
  const point = latestPoint(points);
  return !point || daysSince(point.date) > maxAgeDays;
}

function upsertLatestPoint(points: SeriesPoint[], point: SeriesPoint): SeriesPoint[] {
  const clean = parseObservations(
    points.map((item) => ({ date: item.date, value: String(item.value) })),
  );
  const index = clean.findIndex((item) => item.date === point.date);

  if (index >= 0) {
    return clean.map((item, itemIndex) => (itemIndex === index ? point : item));
  }

  return [...clean, point].sort((a, b) => a.date.localeCompare(b.date));
}

function numberFrom(value: number | string | undefined): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseNowcastRows(section: string): InflationNowcastRow[] {
  const rowPattern =
    /([A-Z][a-z]+ \d{4})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d{2}\/\d{2})/g;
  const rows: InflationNowcastRow[] = [];

  for (const match of section.matchAll(rowPattern)) {
    rows.push({
      month: match[1],
      cpi: Number.parseFloat(match[2]),
      coreCpi: Number.parseFloat(match[3]),
      pce: Number.parseFloat(match[4]),
      corePce: Number.parseFloat(match[5]),
      updated: match[6],
    });
  }

  return rows;
}

function parseQuarterlyNowcast(text: string): InflationNowcastRow | undefined {
  const match = text.match(
    /Quarterly annualized percent change Quarter CPI Core CPI PCE Core PCE Updated\s+(\d{4}:Q\d)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d{2}\/\d{2})/,
  );

  if (!match) return undefined;

  return {
    month: match[1],
    cpi: Number.parseFloat(match[2]),
    coreCpi: Number.parseFloat(match[3]),
    pce: Number.parseFloat(match[4]),
    corePce: Number.parseFloat(match[5]),
    updated: match[6],
  };
}

function parseInflationNowcast(html: string): InflationNowcast {
  const text = normalizeWhitespace(html);
  const momStart = text.indexOf("Inflation, month-over-month percent change");
  const yoyStart = text.indexOf("Inflation, year-over-year percent change");
  const quarterlyStart = text.indexOf("Quarterly annualized percent change");

  if (momStart < 0 || yoyStart < 0 || quarterlyStart < 0) {
    throw new Error("Cleveland Fed nowcast table was not found");
  }

  const monthOverMonth = parseNowcastRows(text.slice(momStart, yoyStart));
  const yearOverYear = parseNowcastRows(text.slice(yoyStart, quarterlyStart));
  const quarterlyAnnualized = parseQuarterlyNowcast(text.slice(quarterlyStart));

  if (monthOverMonth.length === 0 || yearOverYear.length === 0) {
    throw new Error("Cleveland Fed nowcast table returned no usable rows");
  }

  return {
    source: "cleveland-fed",
    sourceName: "Cleveland Fed Inflation Nowcasting",
    latestMonth: monthOverMonth[0].month,
    previousMonth: monthOverMonth[1]?.month,
    updated: monthOverMonth[0].updated,
    monthOverMonth,
    yearOverYear,
    quarterlyAnnualized,
  };
}

async function fetchInflationNowcast(): Promise<InflationNowcast> {
  const response = await fetch(getInflationNowcastUrl(), {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "RateCutRadar/1.0 (+https://rate-cut-radar-1-github-ssh.vercel.app)",
    },
    next: { revalidate: getRevalidateSeconds() },
  });

  if (!response.ok) {
    throw new Error(`Cleveland Fed nowcast returned HTTP ${response.status}`);
  }

  const html = await response.text();
  if (html.trim().length === 0) {
    throw new Error("Cleveland Fed nowcast returned an empty response");
  }

  return parseInflationNowcast(html);
}

async function fetchBrentMarketQuote(): Promise<SeriesPoint> {
  const response = await fetch(getBrentMarketDataUrl(), {
    next: { revalidate: getRevalidateSeconds() },
  });

  if (!response.ok) {
    throw new Error(`Brent market quote returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as OilpriceLastResponse;
  const quote = payload[BRENT_OILPRICE_BLEND_ID];
  const price = numberFrom(quote?.price);
  const timestamp = numberFrom(quote?.time);

  if (price === null || timestamp === null) {
    throw new Error("Brent market quote returned no usable price");
  }

  return {
    date: new Date(timestamp * 1_000).toISOString().slice(0, 10),
    value: price,
  };
}

async function supplementBrentMarketQuote(
  series: DashboardSeries,
): Promise<{ series: DashboardSeries; notice?: string; usedMarketQuote: boolean }> {
  const fredLatest = latestPoint(series.DCOILBRENTEU);

  try {
    const quote = await fetchBrentMarketQuote();
    const nextSeries = upsertLatestPoint(series.DCOILBRENTEU, quote);
    const shouldUseQuote =
      !fredLatest ||
      quote.date >= fredLatest.date ||
      isStale(series.DCOILBRENTEU, getDailyStaleDays());

    if (!shouldUseQuote) {
      return { series, usedMarketQuote: false };
    }

    return {
      series: {
        ...series,
        DCOILBRENTEU: nextSeries,
      },
      notice: fredLatest
        ? `Brent 最新价使用 Oilprice/Barcharts 市场报价（${quote.date}，${quote.value} 美元/桶）；FRED Brent 现货最新观测仍停在 ${fredLatest.date}。`
        : `Brent 最新价使用 Oilprice/Barcharts 市场报价（${quote.date}，${quote.value} 美元/桶）。`,
      usedMarketQuote: true,
    };
  } catch (error) {
    if (!isStale(series.DCOILBRENTEU, getDailyStaleDays())) {
      return { series, usedMarketQuote: false };
    }

    const message = error instanceof Error ? error.message : "unknown error";
    return {
      series,
      notice: `Brent 市场报价暂时不可用，且 FRED Brent 数据可能滞后。错误信息：${message}`,
      usedMarketQuote: false,
    };
  }
}

function buildFreshnessNotices(series: DashboardSeries): string[] {
  return FRED_SERIES_IDS.flatMap((seriesId) => {
    const meta = SERIES_META[seriesId];
    const point = latestPoint(series[seriesId]);
    if (!point) return [`${meta.shortName} 暂无有效数据。`];

    const maxAgeDays =
      meta.frequency === "daily" ? getDailyStaleDays() : getMonthlyStaleDays();
    const age = daysSince(point.date);

    return age > maxAgeDays
      ? [
          `${meta.shortName} 最新观测为 ${point.date}，已滞后约 ${age} 天，请谨慎解读。`,
        ]
      : [];
  });
}

async function getInflationNowcastNotice(): Promise<{
  nowcast?: InflationNowcast;
  notice: string;
}> {
  try {
    const nowcast = await fetchInflationNowcast();
    const mom = nowcast.monthOverMonth[0];
    const yoy = nowcast.yearOverYear[0];

    return {
      nowcast,
      notice: `通胀补充数据使用 Cleveland Fed Inflation Nowcasting（更新 ${nowcast.updated}）：${nowcast.latestMonth} Core PCE nowcast 为 MoM ${mom.corePce}%，YoY ${yoy.corePce}%。`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    return {
      notice: `Cleveland Fed Inflation Nowcasting 暂时不可用，通胀信号仅使用 FRED 官方月频数据。错误信息：${message}`,
    };
  }
}

function dataSourceFor(options: {
  failures: string[];
  usedMarketQuote: boolean;
  hasNowcast: boolean;
}): DashboardData["source"] {
  if (options.failures.length > 0) {
    return options.hasNowcast ? "partial+nowcast" : "partial";
  }

  if (options.usedMarketQuote && options.hasNowcast) {
    return "fred+market+nowcast";
  }

  if (options.usedMarketQuote) return "fred+market";
  if (options.hasNowcast) return "fred+nowcast";
  return "fred";
}

async function fetchFredSeries(
  seriesId: FredSeriesId,
  apiKey: string,
): Promise<SeriesPoint[]> {
  const retryAttempts = getRetryAttempts();
  const url = new URL(`${getFredBaseUrl().replace(/\/$/, "")}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", dateMonthsAgo(getObservationMonths()));

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "x-rate-cut-radar-retry-attempt": String(attempt),
        },
        next: { revalidate: getRevalidateSeconds() },
      });

      if (!response.ok) {
        lastError = new Error(`${seriesId} returned HTTP ${response.status}`);

        if (!shouldRetryStatus(response.status)) {
          throw new NonRetryableFredError(lastError.message);
        }

        if (attempt < retryAttempts) {
          await sleep(retryDelay(attempt));
          continue;
        }

        throw lastError;
      }

      const payload = (await response.json()) as FredObservationResponse;
      if (payload.error_code) {
        lastError = new Error(
          `${seriesId}: ${payload.error_message ?? "FRED API error"}`,
        );

        if (!shouldRetryStatus(payload.error_code)) {
          throw new NonRetryableFredError(lastError.message);
        }

        if (attempt < retryAttempts) {
          await sleep(retryDelay(attempt));
          continue;
        }

        throw lastError;
      }

      const points = parseObservations(payload.observations);
      if (points.length === 0) {
        throw new NonRetryableFredError(
          `${seriesId} returned no usable observations`,
        );
      }

      return points;
    } catch (error) {
      if (error instanceof NonRetryableFredError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retryAttempts) {
        await sleep(retryDelay(attempt));
        continue;
      }
    }
  }

  throw new Error(
    `${lastError?.message ?? `${seriesId} request failed`} after ${retryAttempts} attempts`,
  );
}

function mockDashboardData(warning: string, notices: string[] = []): DashboardData {
  return {
    series: mockDashboardSeries,
    source: "mock",
    updatedAt: new Date().toISOString(),
    warning,
    notices,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const apiKey = process.env.FRED_API_KEY?.trim();

  if (!apiKey) {
    return mockDashboardData(
      "未配置 FRED_API_KEY，当前展示内置 mock data，方便本地预览。",
    );
  }

  try {
    const entries = await Promise.allSettled(
      FRED_SERIES_IDS.map(async (seriesId) => [
        seriesId,
        await fetchFredSeries(seriesId, apiKey),
      ] as const),
    );
    const failures: string[] = [];
    const series = {} as DashboardSeries;

    entries.forEach((entry, index) => {
      const seriesId = FRED_SERIES_IDS[index];

      if (entry.status === "fulfilled") {
        const [id, points] = entry.value;
        series[id] = points;
        return;
      }

      const message =
        entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
      failures.push(`${seriesId}: ${message}`);
      series[seriesId] = mockDashboardSeries[seriesId];
    });

    if (failures.length === FRED_SERIES_IDS.length) {
      return mockDashboardData(
        `FRED API 暂时不可用，已自动切换到 mock data。错误信息：${failures[0]}`,
      );
    }

    const [supplemented, inflationNowcast] = await Promise.all([
      supplementBrentMarketQuote(series),
      getInflationNowcastNotice(),
    ]);
    const notices = [
      ...buildFreshnessNotices(supplemented.series),
      ...(supplemented.notice ? [supplemented.notice] : []),
      inflationNowcast.notice,
    ];
    const source = dataSourceFor({
      failures,
      usedMarketQuote: supplemented.usedMarketQuote,
      hasNowcast: Boolean(inflationNowcast.nowcast),
    });

    return {
      series: supplemented.series,
      source,
      updatedAt: new Date().toISOString(),
      inflationNowcast: inflationNowcast.nowcast,
      warning:
        failures.length > 0
          ? `部分 FRED 指标暂时不可用，已仅对失败指标使用模拟数据：${failures.join("；")}`
          : undefined,
      notices,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return mockDashboardData(
      `FRED API 暂时不可用，已自动切换到 mock data。错误信息：${message}`,
    );
  }
}
