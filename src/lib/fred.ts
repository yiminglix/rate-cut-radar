import { mockDashboardSeries, SERIES_META } from "./mock-data";
import type {
  DashboardData,
  DashboardSeries,
  FredSeriesId,
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

export const FRED_SERIES_IDS = Object.keys(SERIES_META) as FredSeriesId[];

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

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

function mockDashboardData(warning: string): DashboardData {
  return {
    series: mockDashboardSeries,
    source: "mock",
    updatedAt: new Date().toISOString(),
    warning,
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
    const entries = await Promise.all(
      FRED_SERIES_IDS.map(async (seriesId) => [
        seriesId,
        await fetchFredSeries(seriesId, apiKey),
      ]),
    );

    return {
      series: Object.fromEntries(entries) as DashboardSeries,
      source: "fred",
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return mockDashboardData(
      `FRED API 暂时不可用，已自动切换到 mock data。错误信息：${message}`,
    );
  }
}
