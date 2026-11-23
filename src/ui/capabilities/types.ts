import type { FC } from "react";
import type { SurfaceCapability } from "../../domain/capabilityRegistry";
export interface CapabilityPanelProps {
  data: Record<string, any>;
  readonly: boolean;
  onChange: (next: Record<string, any>) => void;
  onTriggerAction?: (action: {
    type: "roll";
    notation: string;
    label: string;
  }) => void;
  userId: string;
  isGM: boolean;
  members: { userId: string; name: string }[];
  canAct?: boolean;
  onComment?: (body: string, deleteId?: string) => Promise<void>;
}
export interface CapabilityPlugin extends SurfaceCapability {
  InspectorPanel: FC<CapabilityPanelProps>;
}
