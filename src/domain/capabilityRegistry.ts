import type { CapabilityType, NoteCapability } from "./types";
export interface SurfaceCapability {
  type: CapabilityType;
  label: string;
  icon: string;
  createDefault: () => Record<string, any>;
  getHoverSummary: (
    data: Record<string, any>,
  ) => { label: string; value: string; accent?: string } | null;
  drawSurfaceBadge: (
    ctx: CanvasRenderingContext2D,
    data: Record<string, any>,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
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
    drawSurfaceBadge(ctx, data, rect) {
      if (type === "event_clock") {
        const segments = Math.max(2, Math.min(24, Number(data.segments) || 6));
        const val = Math.max(0, Math.min(segments, Number(data.value) || 0));
        const trackW = Math.min(112, rect.width * 0.56);
        const barH = 14;
        const by = rect.y + (rect.height - barH) / 2;
        const gap = segments > 10 ? 2 : 3;
        const sw = Math.max(2, (trackW - gap * (segments - 1)) / segments);
        for (let i = 0; i < segments; i++) {
          const sx = rect.x + i * (sw + gap);
          if (i < val) {
            ctx.fillStyle = "#953d30";
            ctx.fillRect(sx, by, sw, barH);
          } else {
            ctx.strokeStyle = "#9c9484";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(sx + 0.75, by + 0.75, sw - 1.5, barH - 1.5);
          }
        }
        ctx.fillStyle = "#504c41";
        ctx.fillText(
          `${val}/${segments}`,
          rect.x + trackW + 10,
          rect.y + rect.height * 0.68,
        );
      } else {
        const s = summary(data);
        ctx.fillText(
          `${icon} ${s?.value ?? ""}`.slice(0, 16),
          rect.x,
          rect.y + rect.height * 0.68,
        );
      }
    },
  });
}
register(
  "checklist",
  "清单",
  "☑",
  () => ({ items: [] }),
  (d) => ({
    label: "清单",
    value: `${(d.items ?? []).filter((i: any) => i.done).length}/${(d.items ?? []).length}`,
  }),
);
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
  "comments",
  "批注",
  "✎",
  () => ({ entries: [] }),
  (d) => ({ label: "批注", value: String(d.entries?.length ?? 0) }),
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
register(
  "resources",
  "物资",
  "≡",
  () => ({ items: [] }),
  (d) => ({ label: "物资", value: `${d.items?.length ?? 0} 项` }),
);
register(
  "tags",
  "标签",
  "#",
  () => ({ tags: [] }),
  (d) => ({ label: "标签", value: (d.tags ?? []).join(" · ") }),
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
