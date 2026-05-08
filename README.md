# Rate Cut Radar

Rate Cut Radar / 降息雷达 is a mobile-first macro decision dashboard for tracking whether a healthy rate cut expectation is forming. It links oil pressure, underlying inflation, Treasury-market confirmation, labor cooling, credit stress, and market inflation expectations into a 0-100 score, then translates the setup into asset implications for Hang Seng Tech, NASDAQ growth, TLT, gold, and BTC.

## V1.7.1 Decision Layer

The home screen prioritizes daily decision-making in Chinese:

- 降息预期分数 with a large circular progress display
- 今日变化 versus the previous trading day
- 当前状态 and 今日一句话
- 资产影响 for 恒生科技, 纳指成长, 长债/TLT, 黄金, and BTC
- One set of three core signal cards: 油价信号, 通胀信号, 美债信号
- Three health checks: 劳动力信号, 信用压力, 通胀预期
- Processed 关键指标 instead of raw-only macro prints
- Collapsed 详细简报 and 方法说明
- 验证路径 charts with conclusion-led Chinese titles

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts
- FRED API as the preferred data source
- Brent market quote supplement when FRED's Brent spot series is stale
- Cleveland Fed Inflation Nowcasting supplement when official PCE is stale
- Built-in mock data when no FRED API key is configured

## FRED Series

The dashboard reads these FRED series:

- `DGS2`: 2-Year Treasury Constant Maturity Rate
- `DGS10`: 10-Year Treasury Constant Maturity Rate
- `DGS30`: 30-Year Treasury Constant Maturity Rate
- `T10Y2Y`: 10Y-2Y Treasury spread
- `T10YIE`: 10-Year Breakeven Inflation Rate
- `T5YIFR`: 5-Year, 5-Year Forward Inflation Expectation Rate
- `BAMLH0A0HYM2`: ICE BofA US High Yield Index Option-Adjusted Spread
- `ICSA`: Initial Claims
- `PCEPILFE`: Core PCE Price Index
- `PCETRIM1M158SFRBDAL`: Trimmed Mean PCE Inflation Rate
- `DCOILBRENTEU`: Brent crude oil price

Brent is still seeded from FRED history, but the latest point can be supplemented from Oilprice/Barcharts because the FRED Brent spot series may lag fast-moving futures markets by several days.

PCE remains anchored to official FRED/BEA history, but the dashboard can supplement the latest unreleased month with Cleveland Fed Inflation Nowcasting so inflation analysis does not stop at the last official monthly release.

## Environment

Copy the example file:

```bash
cp .env.example .env.local
```

Set:

```bash
FRED_API_KEY=your_fred_api_key
```

If `FRED_API_KEY` is empty, the app automatically uses mock data so the UI can still be previewed locally.

Optional variables:

- `FRED_API_BASE_URL`: defaults to `https://api.stlouisfed.org/fred`
- `FRED_OBSERVATION_MONTHS`: defaults to `24`
- `FRED_REVALIDATE_SECONDS`: defaults to `3600` (1 hour)
- `FRED_RETRY_ATTEMPTS`: defaults to `3`
- `FRED_RETRY_DELAY_MS`: defaults to `750`
- `FRED_DAILY_STALE_DAYS`: defaults to `3`
- `FRED_WEEKLY_STALE_DAYS`: defaults to `10`
- `FRED_MONTHLY_STALE_DAYS`: defaults to `75`
- `BRENT_MARKET_DATA_URL`: defaults to Oilprice/Barcharts' public latest-prices JSON and is used only to supplement Brent when the FRED Brent spot series is stale
- `INFLATION_NOWCAST_URL`: defaults to Cleveland Fed Inflation Nowcasting and supplements official monthly PCE data

## Get a FRED API Key

1. Create or log into a FRED account.
2. Open the official FRED API key page: https://fred.stlouisfed.org/docs/api/api_key.html
3. Request a distinct API key for this app.
4. Add the key to `.env.local` as `FRED_API_KEY`.

FRED's series observation endpoint is documented here: https://fred.stlouisfed.org/docs/api/fred/series/series_observations.html

## Local Development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```bash
npm run lint
npm run build
```

## 评分方法

Total score:

- 油价信号: 20 points
- 通胀信号: 25 points
- 美债信号: 25 points
- 劳动力信号: 10 points
- 信用压力: 10 points
- 通胀预期: 10 points

信号颜色:

- 已确认: full score
- 未确认: half score
- 偏粘: zero score
- 数据不足: zero score and no forced judgment

Status:

- `>=80` plus all healthy-status gates pass: Healthy Rate Cut Expectation
- `60-79`: Rate Cut Expectation Warming
- `40-59`: Mixed / Wait and See
- `20-39`: Rate Cut Expectation Weak
- `<20`: Rate Cut Expectation Failed
- Special case: if 2Y yields fall while 10Y or 30Y yields rise clearly, the status becomes Political Cut Risk.
- Health check case: if labor or credit stress turns red, the dashboard will not label the regime as fully healthy even when rate-cut pricing is warming.
- V1.7.1 healthy-status gates: bond must be green; credit, inflation expectations, and oil must not be red or stale; and at least one of inflation or labor must be green.

通胀逻辑:

- Core PCE YoY checks whether the year-over-year inflation rate is slowing.
- Core PCE 3M annualized checks short-term underlying inflation momentum.
- Trimmed Mean PCE 6M annualized compounds the latest six monthly annualized trimmed-mean readings.
- PCE inputs are official monthly data, so the dashboard displays the latest official observation month instead of implying daily freshness.
- If official PCE is behind the market date, the dashboard also displays Cleveland Fed Core PCE nowcast for the latest unreleased month and uses it as a timeliness overlay.
- If there is not enough PCE history, the app shows 数据不足 instead of judging inflation from index levels.

V1.7 健康校验:

- Initial Claims checks whether the labor market is cooling gently or breaking abruptly.
- High Yield OAS checks whether lower yields are happening without credit panic.
- 5Y5Y inflation expectations and 10Y breakeven inflation check whether the market still believes inflation is anchored.
- A healthy rate-cut setup needs softer inflation, cooperative long-end Treasuries, calm credit, and labor cooling that is not recessionary.

## Code Structure

```text
src/app/page.tsx             Main dashboard page
src/components/RadarCharts.tsx
src/lib/fred.ts              FRED fetcher and mock fallback
src/lib/mock-data.ts         Series metadata and preview data
src/lib/signals.ts           Signal colors, score, status
src/lib/brief.ts             Executive summary and Chinese daily brief templates
src/lib/types.ts             Shared types
```

## Deploy to Vercel

1. Push the repository to GitHub.
2. Import the repository in Vercel.
3. Select the Next.js framework preset.
4. Add environment variables in Vercel Project Settings:
   - `FRED_API_KEY`
   - optional `FRED_OBSERVATION_MONTHS`
   - optional `FRED_REVALIDATE_SECONDS`
5. Deploy.

The API key stays server-side. Client components only receive normalized series data and computed dashboard props.

## Roadmap

- Automated daily report generation
- Telegram and email push
- Historical score archive
- Watchlist-specific asset impact notes
- Database-backed snapshots
