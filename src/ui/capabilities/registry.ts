import { capabilityRegistry } from "../../domain/capabilityRegistry";
import { ChecklistPanel } from "./ChecklistPanel";
import { EventClockPanel } from "./EventClockPanel";
import { DiceActionPanel } from "./DiceActionPanel";
import { CommentsPanel } from "./CommentsPanel";
import { SecretPanel } from "./SecretPanel";
import { ResourcesPanel } from "./ResourcesPanel";
import { TagsPanel } from "./TagsPanel";
import type { CapabilityPlugin } from "./types";
const panels = {
  checklist: ChecklistPanel,
  event_clock: EventClockPanel,
  dice_action: DiceActionPanel,
  comments: CommentsPanel,
  secret: SecretPanel,
  resources: ResourcesPanel,
  tags: TagsPanel,
};
export const plugins: CapabilityPlugin[] = capabilityRegistry
  .all()
  .map((plugin) => ({ ...plugin, InspectorPanel: panels[plugin.type] }));
