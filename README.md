# Rate Cut Radar

Rate Cut Radar / 降息雷达 is a mobile-first macro dashboard for tracking whether a healthy rate cut expectation is forming. It combines oil, inflation, and Treasury market signals into a 0-100 score, a status label, signal cards, charts, and a Chinese daily brief.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts
- FRED API as the preferred data source
- Built-in mock data when no FRED API key is configured

## FRED Series

The first version reads these FRED series:

- `DGS2`: 2-Year Treasury Constant Maturity Rate
- `DGS10`: 10-Year Treasury Constant Maturity Rate
- `DGS30`: 30-Year Treasury Constant Maturity Rate
- `T10Y2Y`: 10Y-2Y Treasury spread
- `PCEPILFE`: Core PCE Price Index
- `PCETRIM1M158SFRBDAL`: Trimmed Mean PCE Inflation Rate
- `DCOILBRENTEU`: Brent crude oil price

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
- `FRED_OBSERVATION_MONTHS`: defaults to `18`
- `FRED_REVALIDATE_SECONDS`: defaults to `21600`

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

## Scoring Methodology

Total score:

- Oil Signal: 30 points
- Inflation Signal: 35 points
- Bond Market Signal: 35 points

Signal colors:

- Green: full score
- Yellow: half score
- Red: zero score

Status:

- `>=80`: Healthy Rate Cut Expectation
- `60-79`: Rate Cut Expectation Warming
- `40-59`: Mixed / Wait and See
- `20-39`: Rate Cut Expectation Weak
- `<20`: Rate Cut Expectation Failed
- Special case: if 2Y yields fall while 10Y or 30Y yields rise clearly, the status becomes Political Cut Risk.

## Code Structure

```text
src/app/page.tsx             Main dashboard page
src/components/RadarCharts.tsx
src/lib/fred.ts              FRED fetcher and mock fallback
src/lib/mock-data.ts         Series metadata and preview data
src/lib/signals.ts           Signal colors, score, status
src/lib/brief.ts             Chinese daily brief templates
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
