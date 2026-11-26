import { capabilityRegistry } from "../../domain/capabilityRegistry";
import { EventClockPanel } from "./EventClockPanel";
import { DiceActionPanel } from "./DiceActionPanel";
import { SecretPanel } from "./SecretPanel";
import type { CapabilityPlugin } from "./types";
const panels = {
  event_clock: EventClockPanel,
  dice_action: DiceActionPanel,
  secret: SecretPanel,
};
export const plugins: CapabilityPlugin[] = capabilityRegistry
  .all()
  .map((plugin) => ({ ...plugin, InspectorPanel: panels[plugin.type] }));
