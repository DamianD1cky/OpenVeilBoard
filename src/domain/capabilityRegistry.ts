import type { CapabilityType, NoteCapability } from "./types";
export interface SurfaceCapability {
  type: CapabilityType;
  label: string;
  icon: string;
  createDefault: () => Record<string, any>;
  getHoverSummary: (
    data: Record<string, any>,
  ) => { label: string; value: string; accent?: string } | null;
}
const plugins = new Map<CapabilityType, SurfaceCapability>();
function register(
  type: CapabilityType,
  label: string,
  icon: string,
  createDefault: SurfaceCapability["createDefault"],
  summary: SurfaceCapability["getHoverSummary"],
) {
  plugins.set(type, {
    type,
    label,
    icon,
    createDefault,
    getHoverSummary: summary,
  });
}
register(
  "event_clock",
  "事件钟",
  "◴",
  () => ({
    name: "事件",
    segments: 6,
    value: 0,
    mode: "progress",
    consequence: "",
    pinned: true,
    primary: false,
  }),
  (d) => ({
    label: d.name || "事件钟",
    value: `${d.value ?? 0}/${d.segments ?? 6}`,
  }),
);
register(
  "dice_action",
  "检定",
  "⚄",
  () => ({ notation: "1d20", label: "", last: null }),
  (d) => ({
    label: "检定",
    value: d.last == null ? d.notation : `${d.notation} · ${d.last}`,
  }),
);
register(
  "secret",
  "保密封条",
  "▧",
  () => ({ scope: "all", users: [] }),
  (d) => ({
    label: "可见范围",
    value:
      d.scope === "gm" ? "仅 GM" : d.scope === "selected" ? "指定成员" : "全员",
  }),
);
export const capabilityRegistry = {
  get: (type: CapabilityType) => plugins.get(type),
  all: () => [...plugins.values()],
};
export function createCapability(type: CapabilityType): NoteCapability {
  const plugin = plugins.get(type);
  if (!plugin) throw new Error("未知能力。");
  return {
    id: crypto.randomUUID(),
    type,
    enabled: true,
    data: plugin.createDefault(),
  };
}
export function canReadNote(
  note: { capabilities: NoteCapability[] },
  userId: string,
  role: string,
) {
  if (role === "gm") return true;
  return note.capabilities.every(
    (c) =>
      !c.enabled ||
      c.type !== "secret" ||
      c.data.scope === "all" ||
      (c.data.scope === "selected" && c.data.users?.includes(userId)),
  );
}
