import type { DataSource, RadarStatus, RateCutRadar, SignalColor } from "./types";

function deltaPhrase(delta: number): string {
  if (delta > 0) return `较上一交易日上升 ${delta} 分`;
  if (delta < 0) return `较上一交易日下降 ${Math.abs(delta)} 分`;
  return "较上一交易日持平";
}

function statusLabel(status: RadarStatus): string {
  const labels: Record<RadarStatus, string> = {
    "Healthy Rate Cut Expectation": "健康降息预期",
    "Rate Cut Expectation Warming": "降息预期升温",
    "Mixed / Wait and See": "混合观望",
    "Rate Cut Expectation Weak": "降息预期偏弱",
    "Political Cut Risk": "政治化降息风险",
    "Rate Cut Expectation Failed": "降息预期失败",
  };

  return labels[status];
}

function oilPhrase(color: SignalColor): string {
  if (color === "green") {
    return "油价已经明显从近 20 个交易日高点回落，并跌到 20 日均线下方，能源通胀压力开始缓和。";
  }
  if (color === "yellow") {
    return "油价有回落迹象，但幅度还没有形成强确认，对降息交易只是边际友好。";
  }
  if (color === "stale") {
    return "油价数据不足，今天不强行判断能源端是否支持降息。";
  }
  return "油价仍接近近期高位或回落不足，能源通胀可能继续压制降息空间。";
}

function inflationPhrase(color: SignalColor): string {
  if (color === "green") {
    return "Core PCE YoY、Core PCE 3M 年化和 Trimmed Mean PCE 6M 年化同步放缓，通胀端给出了较干净的配合。";
  }
  if (color === "yellow") {
    return "底层通胀只有部分指标放缓，说明价格压力在改善，但黏性仍未完全解除。";
  }
  if (color === "stale") {
    return "PCE 历史数据不足，今天只展示数据，不把指数水平误判为通胀降温。";
  }
  return "Core PCE 与 Trimmed Mean PCE 的关键动能没有放缓，通胀端暂时不支持健康降息预期。";
}

function bondPhrase(radar: RateCutRadar): string {
  if (radar.politicalCutRisk) {
    return "美债市场最值得警惕：2Y 下行但 10Y/30Y 上行，长端并未买账，政治化降息或期限溢价风险上升。";
  }

  const color = radar.signals.bond.color;
  if (color === "green") {
    return "2Y 下行且长端同步下行或基本持平，债券市场正在认可更健康的降息路径。";
  }
  if (color === "yellow") {
    return "美债曲线还没有形成一致确认，短端降息交易和长端风险定价仍需继续观察。";
  }
  if (color === "stale") {
    return "美债数据不足，今天暂不判断债券市场是否买账。";
  }
  return "长端收益率上行削弱了降息交易质量，市场对未来通胀、财政或期限溢价仍有顾虑。";
}

function healthCheckPhrase(radar: RateCutRadar): string {
  const laborColor = radar.signals.labor.color;
  const creditColor = radar.signals.credit.color;
  const expectationsColor = radar.signals.inflationExpectations.color;

  if (radar.healthStressRisk) {
    return "健康校验提示，就业或信用压力正在升温，降息叙事需要防止从软着陆切换为压力降息。";
  }

  if (
    laborColor === "green" &&
    creditColor === "green" &&
    expectationsColor === "green"
  ) {
    return "劳动力温和降温，信用利差稳定，通胀预期被锚住，健康校验也在配合。";
  }

  return "健康校验仍需跟踪：就业、信用利差和通胀预期还没有同时给出强确认。";
}

function policyPhrase(radar: RateCutRadar): string {
  if (radar.policyPricingRisk) {
    return "政策期货没有配合降息叙事，外部市场反而在定价加息风险，因此需要压低降息预期健康度。";
  }

  return "";
}

function assetPhrase(radar: RateCutRadar): string {
  if (radar.politicalCutRisk) {
    return "资产含义上，恒生科技、纳指成长和 BTC 可能先受流动性想象推动，但真正的风险偏好修复需要长端美债企稳；TLT 不宜追高，黄金对冲价值上升。";
  }
  if (radar.healthStressRisk) {
    return "资产含义上，长债和黄金更像防守受益，恒生科技、纳指成长和 BTC 需要防止风险偏好回落。";
  }
  if (radar.status === "Healthy Rate Cut Expectation") {
    return "这对恒生科技、纳指成长、TLT 和 BTC 都偏友好，尤其利好久期资产与高弹性风险资产。";
  }
  if (radar.score >= 80) {
    return "资产含义上，高分区对成长和久期资产偏友好，但还需要通胀或就业进一步确认，不能当成完全健康顺风。";
  }
  if (radar.score >= 60) {
    return "恒生科技和纳指成长可获得估值修复窗口，TLT 偏多但需控制节奏，BTC 更依赖流动性预期延续。";
  }
  return "对恒生科技、纳指成长和 BTC 只能视为反弹环境，TLT 也需要等待更清晰的通胀和长端利率确认。";
}

export function generateDailyBrief(
  radar: RateCutRadar,
  source: DataSource,
): string {
  const sourcePhrases: Record<DataSource, string> = {
    fred: "基于 FRED 最新可用数据",
    "fred+market": "基于 FRED 数据，并用市场与政策定价数据补充最新状态",
    "fred+nowcast": "基于 FRED 数据，并用 Cleveland Fed nowcast 补充通胀",
    "fred+market+nowcast":
      "基于 FRED 数据，并用市场/政策数据补充最新状态、用 Cleveland Fed nowcast 补充通胀",
    partial: "基于部分 FRED 数据，失败指标使用模拟数据兜底",
    "partial+nowcast":
      "基于部分 FRED 数据，失败指标使用模拟数据兜底，并用 Cleveland Fed nowcast 补充通胀",
    mock: "基于本地 mock data 预览",
  };

  return `${sourcePhrases[source]}，降息预期分数当前为 ${radar.score} 分，${deltaPhrase(
    radar.scoreDelta,
  )}，当前状态为${statusLabel(radar.status)}。${oilPhrase(
    radar.signals.oil.color,
  )}${inflationPhrase(radar.signals.inflation.color)}${bondPhrase(
    radar,
  )}${healthCheckPhrase(radar)}${policyPhrase(radar)}${assetPhrase(radar)}`;
}

export function generateExecutiveSummary(radar: RateCutRadar): string {
  if (radar.politicalCutRisk) {
    return "短端降息，长端不信，警惕高波动。";
  }

  if (radar.policyPricingRisk) {
    return "政策定价不配合，别只看宏观高分。";
  }

  if (radar.healthStressRisk) {
    return "降息升温，但有压力降息风险。";
  }

  if (radar.status === "Healthy Rate Cut Expectation") {
    return "降息预期健康，久期与成长占优。";
  }

  if (radar.status === "Rate Cut Expectation Warming") {
    return "降息预期升温，但还未完全健康。";
  }

  if (radar.status === "Mixed / Wait and See") {
    return "信号分裂，先观察不重仓。";
  }

  return "降息预期偏弱，风险资产防守。";
}
