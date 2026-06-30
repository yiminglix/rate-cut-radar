import { mockDashboardSeries, SERIES_META } from "./mock-data";
import type {
  AssetImpact,
  AssetMarketTrend,
  DashboardData,
  DashboardSeries,
  FredSeriesId,
  InflationNowcast,
  InflationNowcastRow,
  MarketContext,
  PolicyPricing,
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

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }> | null;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

export const FRED_SERIES_IDS = Object.keys(SERIES_META) as FredSeriesId[];

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const BRENT_OILPRICE_BLEND_ID = "46";
const BRENT_MARKET_DATA_URL =
  "https://s3.amazonaws.com/oilprice.com/widgets/oilprices/all/last.json";
const CLEVELAND_FED_NOWCAST_URL =
  "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting";
const TREASURY_DAILY_RATES_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv";
const YAHOO_CHART_BASE_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart";
const CME_FEDWATCH_URL =
  "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html";
const FED_FUNDS_FUTURE_SYMBOL = "ZQ=F";

const ASSET_MARKET_SYMBOLS: Array<{
  asset: AssetImpact["asset"];
  symbol: string;
  sourceName: string;
}> = [
  { asset: "恒生科技", symbol: "3067.HK", sourceName: "Yahoo Finance" },
  { asset: "纳指成长", symbol: "QQQ", sourceName: "Yahoo Finance" },
  { asset: "长债/TLT", symbol: "TLT", sourceName: "Yahoo Finance" },
  { asset: "黄金", symbol: "GLD", sourceName: "Yahoo Finance" },
  { asset: "BTC", symbol: "BTC-USD", sourceName: "Yahoo Finance" },
];

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

function getWeeklyStaleDays(): number {
  const configured = Number(process.env.FRED_WEEKLY_STALE_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : 10;
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

function getTreasuryDailyRatesUrl(): string {
  return process.env.TREASURY_DAILY_RATES_URL ?? TREASURY_DAILY_RATES_URL;
}

function getYahooChartBaseUrl(): string {
  return process.env.YAHOO_CHART_BASE_URL ?? YAHOO_CHART_BASE_URL;
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

function businessDaysSince(dateString: string, now = new Date()): number {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const cursor = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  let days = 0;

  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= today) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
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
      notice: `Brent 已使用 Oilprice/Barcharts 市场报价更新至 ${quote.date}，最新 ${quote.value} 美元/桶。`,
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

function parseTreasuryDate(value: string): string {
  const [month, day, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

async function fetchTreasuryDailyRates(): Promise<{
  date: string;
  twoYear: number;
  tenYear: number;
  thirtyYear: number;
}> {
  const year = new Date().getUTCFullYear();
  const url = new URL(`${getTreasuryDailyRatesUrl()}/${year}/all`);
  url.searchParams.set("type", "daily_treasury_yield_curve");
  url.searchParams.set("field_tdr_date_value", String(year));
  url.searchParams.set("_format", "csv");

  const response = await fetch(url, {
    headers: {
      accept: "text/csv",
      "user-agent": "RateCutRadar/1.0 (+https://rate-cut-radar-1-github-ssh.vercel.app)",
    },
    next: { revalidate: getRevalidateSeconds() },
  });

  if (!response.ok) {
    throw new Error(`Treasury daily rates returned HTTP ${response.status}`);
  }

  const csv = await response.text();
  const [headerLine, firstDataLine] = csv.trim().split(/\r?\n/);
  if (!headerLine || !firstDataLine) {
    throw new Error("Treasury daily rates returned no usable rows");
  }

  const headers = parseCsvLine(headerLine);
  const values = parseCsvLine(firstDataLine);
  const valueFor = (name: string): number => {
    const index = headers.indexOf(name);
    const value = Number.parseFloat(values[index] ?? "");
    if (!Number.isFinite(value)) {
      throw new Error(`Treasury daily rates missing ${name}`);
    }
    return value;
  };

  return {
    date: parseTreasuryDate(values[0]),
    twoYear: valueFor("2 Yr"),
    tenYear: valueFor("10 Yr"),
    thirtyYear: valueFor("30 Yr"),
  };
}

async function supplementTreasuryRates(
  series: DashboardSeries,
): Promise<{ series: DashboardSeries; notice?: string; usedTreasuryRates: boolean }> {
  try {
    const rates = await fetchTreasuryDailyRates();
    const nextSeries: DashboardSeries = {
      ...series,
      DGS2: upsertLatestPoint(series.DGS2, {
        date: rates.date,
        value: rates.twoYear,
      }),
      DGS10: upsertLatestPoint(series.DGS10, {
        date: rates.date,
        value: rates.tenYear,
      }),
      DGS30: upsertLatestPoint(series.DGS30, {
        date: rates.date,
        value: rates.thirtyYear,
      }),
      T10Y2Y: upsertLatestPoint(series.T10Y2Y, {
        date: rates.date,
        value: rates.tenYear - rates.twoYear,
      }),
    };
    const fredLatest = latestPoint(series.DGS10);

    return {
      series: nextSeries,
      notice:
        fredLatest && rates.date > fredLatest.date
          ? `美债收益率已使用 U.S. Treasury Daily Treasury Rates 更新至 ${rates.date}（最新可用官方交易日）。`
          : undefined,
      usedTreasuryRates: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    return {
      series,
      notice: `U.S. Treasury Daily Treasury Rates 暂时不可用，美债仍使用 FRED 最新观测。错误信息：${message}`,
      usedTreasuryRates: false,
    };
  }
}

function yahooChartUrl(symbol: string, range = "6mo", interval = "1d"): string {
  const encodedSymbol = encodeURIComponent(symbol);
  const url = new URL(`${getYahooChartBaseUrl().replace(/\/$/, "")}/${encodedSymbol}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", interval);
  return url.toString();
}

function chartPointsFromYahoo(payload: YahooChartResponse): SeriesPoint[] {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .flatMap((timestamp, index) => {
      const close = closes[index];
      if (close === null || close === undefined) return [];

      return [
        {
          date: new Date(timestamp * 1_000).toISOString().slice(0, 10),
          value: close,
        },
      ];
    })
    .filter((point) => Number.isFinite(point.value));
}

async function fetchYahooChart(
  symbol: string,
  range = "6mo",
): Promise<SeriesPoint[]> {
  const response = await fetch(yahooChartUrl(symbol, range), {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (compatible; RateCutRadar/1.0; +https://rate-cut-radar-1-github-ssh.vercel.app)",
    },
    next: { revalidate: getRevalidateSeconds() },
  });

  if (!response.ok) {
    throw new Error(`${symbol} chart returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const points = chartPointsFromYahoo(payload);
  if (points.length === 0) {
    throw new Error(`${symbol} chart returned no usable prices`);
  }

  return points;
}

function pointChangePct(points: SeriesPoint[], lookback: number): number {
  const current = points.at(-1);
  const previous = points.at(Math.max(points.length - 1 - lookback, 0));
  if (!current || !previous || previous.value === 0) return 0;

  return ((current.value - previous.value) / previous.value) * 100;
}

function assetTrendFrom(points: SeriesPoint[]): AssetMarketTrend["trend"] {
  const oneMonth = pointChangePct(points, 21);
  const threeMonth = pointChangePct(points, 63);

  if (oneMonth <= -3 && threeMonth <= -5) return "down";
  if (oneMonth >= 3 && threeMonth >= 5) return "up";
  return "flat";
}

async function fetchAssetTrend(
  asset: AssetImpact["asset"],
  symbol: string,
  sourceName: string,
): Promise<AssetMarketTrend> {
  const points = await fetchYahooChart(symbol);
  const latest = points.at(-1);
  if (!latest) throw new Error(`${symbol} returned no latest price`);

  const sixMonthHigh = Math.max(...points.map((point) => point.value));

  return {
    asset,
    symbol,
    sourceName,
    latestDate: latest.date,
    latestPrice: roundNumber(latest.value, 2),
    oneMonthChangePct: roundNumber(pointChangePct(points, 21), 2),
    threeMonthChangePct: roundNumber(pointChangePct(points, 63), 2),
    drawdownFromSixMonthHighPct: roundNumber(
      ((sixMonthHigh - latest.value) / sixMonthHigh) * 100,
      2,
    ),
    trend: assetTrendFrom(points),
  };
}

function roundNumber(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchLatestDff(apiKey: string): Promise<SeriesPoint | undefined> {
  try {
    const points = await fetchFredSeries("DFF", apiKey);
    return latestPoint(points);
  } catch {
    return undefined;
  }
}

async function fetchPolicyPricing(apiKey: string): Promise<PolicyPricing> {
  const points = await fetchYahooChart(FED_FUNDS_FUTURE_SYMBOL, "1mo");
  const latest = points.at(-1);
  if (!latest) throw new Error("Fed Funds Futures returned no latest price");

  const effectiveRate = await fetchLatestDff(apiKey);
  const impliedRate = 100 - latest.value;
  const impliedDeltaBps = effectiveRate
    ? (impliedRate - effectiveRate.value) * 100
    : undefined;
  const stance =
    impliedDeltaBps === undefined
      ? "unknown"
      : impliedDeltaBps >= 10
        ? "hike"
        : impliedDeltaBps <= -10
          ? "cut"
          : "neutral";

  return {
    sourceName: "Yahoo Finance ZQ=F / CME Fed Funds Futures proxy",
    latestDate: latest.date,
    fedFundsFutureSymbol: FED_FUNDS_FUTURE_SYMBOL,
    fedFundsFuturePrice: roundNumber(latest.value, 3),
    impliedRate: roundNumber(impliedRate, 2),
    effectiveFedFundsRate: effectiveRate
      ? roundNumber(effectiveRate.value, 2)
      : undefined,
    impliedDeltaBps:
      impliedDeltaBps === undefined ? undefined : roundNumber(impliedDeltaBps, 1),
    stance,
    cmeFedWatchUrl: CME_FEDWATCH_URL,
    note:
      "CME FedWatch 不允许后端自动抓取；这里使用 30-Day Fed Funds Futures 作为可自动更新的政策定价代理，并保留 CME FedWatch 人工核验链接。",
  };
}

async function getMarketContext(apiKey: string): Promise<MarketContext> {
  const assetEntries = await Promise.allSettled(
    ASSET_MARKET_SYMBOLS.map((asset) =>
      fetchAssetTrend(asset.asset, asset.symbol, asset.sourceName),
    ),
  );
  const assetTrends: AssetMarketTrend[] = [];
  const notices: string[] = [];

  assetEntries.forEach((entry, index) => {
    if (entry.status === "fulfilled") {
      assetTrends.push(entry.value);
      return;
    }

    const asset = ASSET_MARKET_SYMBOLS[index];
    const message =
      entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
    notices.push(`${asset.asset} 价格趋势暂时不可用（${asset.symbol}）：${message}`);
  });

  try {
    const policyPricing = await fetchPolicyPricing(apiKey);
    return {
      assetTrends,
      policyPricing,
      notices: [
        ...notices,
        `政策定价使用 ${policyPricing.sourceName}：隐含利率 ${policyPricing.impliedRate}%，${
          policyPricing.impliedDeltaBps === undefined
            ? "暂缺 DFF 基准"
            : `相对有效联邦基金利率 ${policyPricing.impliedDeltaBps} 基点`
        }。`,
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      assetTrends,
      notices: [...notices, `政策定价补充数据暂时不可用：${message}`],
    };
  }
}

function buildFreshnessNotices(series: DashboardSeries): string[] {
  return FRED_SERIES_IDS.flatMap((seriesId) => {
    const meta = SERIES_META[seriesId];
    const point = latestPoint(series[seriesId]);
    if (!point) return [`${meta.shortName} 暂无有效数据。`];

    const maxAgeDays =
      meta.frequency === "daily"
        ? getDailyStaleDays()
        : meta.frequency === "weekly"
          ? getWeeklyStaleDays()
          : getMonthlyStaleDays();
    const age =
      meta.frequency === "monthly" ? daysSince(point.date) : businessDaysSince(point.date);

    return age > maxAgeDays
      ? [
          `${meta.shortName} 最新观测为 ${point.date}，已滞后约 ${age} 个交易日，请谨慎解读。`,
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
  seriesId: string,
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

    const treasurySupplemented = await supplementTreasuryRates(series);
    const [brentSupplemented, inflationNowcast, marketContext] = await Promise.all([
      supplementBrentMarketQuote(treasurySupplemented.series),
      getInflationNowcastNotice(),
      getMarketContext(apiKey),
    ]);
    const notices = [
      ...buildFreshnessNotices(brentSupplemented.series),
      ...(treasurySupplemented.notice ? [treasurySupplemented.notice] : []),
      ...(brentSupplemented.notice ? [brentSupplemented.notice] : []),
      inflationNowcast.notice,
      ...marketContext.notices,
    ];
    const source = dataSourceFor({
      failures,
      usedMarketQuote:
        treasurySupplemented.usedTreasuryRates || brentSupplemented.usedMarketQuote,
      hasNowcast: Boolean(inflationNowcast.nowcast),
    });

    return {
      series: brentSupplemented.series,
      source,
      updatedAt: new Date().toISOString(),
      inflationNowcast: inflationNowcast.nowcast,
      marketContext,
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
