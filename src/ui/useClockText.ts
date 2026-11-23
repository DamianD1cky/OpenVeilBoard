import { useEffect, useState } from "react";
import { clockText } from "../domain/clockText";
import type { CampaignClockConfig } from "../features/campaign/domain/campaignClock";
export function useClockText(clock: CampaignClockConfig) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!clock.running) return;
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [clock.running]);
  return clockText(clock);
}
