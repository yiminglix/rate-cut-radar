import type { DataSource, RateCutRadar, SignalColor } from "./types";

function deltaPhrase(delta: number): string {
  if (delta > 0) return `较上一交易日上升 ${delta} 分`;
  if (delta < 0) return `较上一交易日下降 ${Math.abs(delta)} 分`;
  return "较上一交易日持平";
}

function oilPhrase(color: SignalColor): string {
  if (color === "green") {
    return "油价已经明显从近 20 个交易日高点回落，并跌到 20 日均线下方，能源端开始支持降息预期。";
  }
  if (color === "yellow") {
    return "油价有回落迹象，但幅度还没有形成强确认，对降息交易只是边际友好。";
  }
  return "油价仍接近近期高位或回落不足，能源通胀可能继续压制健康降息叙事。";
}

function inflationPhrase(color: SignalColor): string {
  if (color === "green") {
    return "核心 PCE 动能和 Trimmed Mean PCE 同步放缓，通胀端给出了较干净的配合。";
  }
  if (color === "yellow") {
    return "通胀只有部分放缓，说明价格压力在改善，但黏性仍未完全解除。";
  }
  return "核心 PCE 与 Trimmed Mean PCE 没有同步放缓，通胀端暂时不支持激进降息预期。";
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
  return "长端收益率上行削弱了降息交易质量，市场对未来通胀、财政或期限溢价仍有顾虑。";
}

function assetPhrase(radar: RateCutRadar): string {
  if (radar.politicalCutRisk) {
    return "资产含义上，恒科、纳指成长和 crypto 可能先涨后震荡，真正的风险偏好修复需要长债企稳；长债本身不宜追高。";
  }
  if (radar.score >= 80) {
    return "这对恒科、纳指成长、长债和 crypto 都偏友好，尤其利好久期资产与高 beta 风险资产。";
  }
  if (radar.score >= 60) {
    return "恒科和纳指成长可获得估值修复窗口，长债偏多但需控制节奏，crypto 更依赖流动性预期延续。";
  }
  return "对恒科、纳指成长和 crypto 只能视为反弹环境，长债也需要等待更清晰的通胀和长端利率确认。";
}

export function generateDailyBrief(
  radar: RateCutRadar,
  source: DataSource,
): string {
  const sourcePhrase =
    source === "fred" ? "基于 FRED 最新可用数据" : "基于本地 mock data 预览";

  return `${sourcePhrase}，Rate Cut Score 当前为 ${radar.score} 分，${deltaPhrase(
    radar.scoreDelta,
  )}，状态为 ${radar.status}。${oilPhrase(
    radar.signals.oil.color,
  )}${inflationPhrase(radar.signals.inflation.color)}${bondPhrase(
    radar,
  )}${assetPhrase(radar)}`;
}
