import {
  campaignClockValue,
  formatClockDuration,
  type CampaignClockConfig,
} from "../features/campaign/domain/campaignClock";
export function clockText(clock: CampaignClockConfig) {
  const value = campaignClockValue(clock);
  if (clock.mode !== "clock")
    return `${clock.mode === "countdown" ? "倒计时" : "正计时"} · ${formatClockDuration(value)}`;
  const date = new Date(value);
  return `${clock.era} ${date.getFullYear()} · ${date.getMonth() + 1}月${date.getDate()}日 · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
