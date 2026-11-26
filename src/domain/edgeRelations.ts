import type { NoteEdge } from "./types";

export type EdgeDirection = "none" | "forward" | "both";
export type EdgeRelationCategory = "hostile" | "bond" | "pact" | "mystery";

export interface RelationPreset {
  id: string;
  label: string;
  category: EdgeRelationCategory;
  style: NoteEdge["style"];
  color: string;
  defaultDirection?: EdgeDirection;
}

export const RELATION_PRESETS: RelationPreset[] = [
  {
    id: "enemy",
    label: "仇人",
    category: "hostile",
    style: "rope",
    color: "#b83227",
    defaultDirection: "both",
  },
  {
    id: "lover",
    label: "情人",
    category: "bond",
    style: "gold",
    color: "#bc984d",
    defaultDirection: "both",
  },
  {
    id: "ally",
    label: "盟友",
    category: "pact",
    style: "twine",
    color: "#96866d",
    defaultDirection: "none",
  },
  {
    id: "kin",
    label: "血亲",
    category: "bond",
    style: "gold",
    color: "#bc984d",
    defaultDirection: "none",
  },
  {
    id: "debt",
    label: "债务",
    category: "pact",
    style: "twine",
    color: "#96866d",
    defaultDirection: "forward",
  },
  {
    id: "suspect",
    label: "嫌疑",
    category: "mystery",
    style: "muted",
    color: "#55534b",
    defaultDirection: "forward",
  },
  {
    id: "secret",
    label: "秘密",
    category: "mystery",
    style: "muted",
    color: "#55534b",
    defaultDirection: "none",
  },
  {
    id: "employ",
    label: "雇佣",
    category: "pact",
    style: "twine",
    color: "#96866d",
    defaultDirection: "forward",
  },
];

export const EDGE_STYLE_COLORS: Record<NoteEdge["style"], string> = {
  rope: "#b83227",
  twine: "#96866d",
  gold: "#bc984d",
  muted: "#55534b",
};

export interface EdgeTagVisual {
  category: EdgeRelationCategory;
  paper: string;
  border: string;
  ink: string;
  accent: string;
  doubleFrame: boolean;
  sealDot: boolean;
  serif: boolean;
}

const CATEGORY_VISUALS: Record<EdgeRelationCategory, EdgeTagVisual> = {
  hostile: {
    category: "hostile",
    paper: "#f3e6d6",
    border: "rgba(158, 36, 27, 0.72)",
    ink: "#7d1b14",
    accent: "#b83227",
    doubleFrame: true,
    sealDot: false,
    serif: false,
  },
  bond: {
    category: "bond",
    paper: "#f7f0e2",
    border: "rgba(168, 122, 54, 0.56)",
    ink: "#4a2428",
    accent: "#a83244",
    doubleFrame: false,
    sealDot: true,
    serif: true,
  },
  pact: {
    category: "pact",
    paper: "#ede1ca",
    border: "rgba(62, 86, 66, 0.54)",
    ink: "#2d4233",
    accent: "#486850",
    doubleFrame: false,
    sealDot: false,
    serif: false,
  },
  mystery: {
    category: "mystery",
    paper: "#e4e3dc",
    border: "rgba(52, 54, 58, 0.52)",
    ink: "#242629",
    accent: "#55534b",
    doubleFrame: false,
    sealDot: false,
    serif: false,
  },
};

export function parseEdgeLabel(raw: string): {
  text: string;
  direction: EdgeDirection;
} {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.endsWith("↔")) {
    return { text: trimmed.slice(0, -1).trim(), direction: "both" };
  }
  if (trimmed.endsWith("→")) {
    return { text: trimmed.slice(0, -1).trim(), direction: "forward" };
  }
  return { text: trimmed, direction: "none" };
}

export function formatEdgeLabel(
  text: string,
  direction: EdgeDirection = "none",
): string {
  const clean = String(text ?? "")
    .replace(/[→↔←]+$/g, "")
    .trim();
  if (!clean) return "";
  if (direction === "forward") return `${clean} →`;
  if (direction === "both") return `${clean} ↔`;
  return clean;
}

export function classifyEdgeTag(
  label: string,
  style: NoteEdge["style"] = "rope",
): EdgeTagVisual {
  const { text } = parseEdgeLabel(label);
  if (/(仇|敌|杀|恨|背叛|宿敌|猎杀|死敌|复仇)/.test(text)) {
    return CATEGORY_VISUALS.hostile;
  }
  if (/(情|爱|恋|婚|妻|夫|亲|母|父|兄|姐|妹|弟|羁绊|挚爱)/.test(text)) {
    return CATEGORY_VISUALS.bond;
  }
  if (/(盟|友|债|雇|契|约|搭档|师|徒|交易|合作|线人|同伙)/.test(text)) {
    return CATEGORY_VISUALS.pact;
  }
  if (/(疑|秘|凶|目击|失踪|线索|调查|隐瞒|疑犯)/.test(text)) {
    return CATEGORY_VISUALS.mystery;
  }
  if (style === "gold") return CATEGORY_VISUALS.bond;
  if (style === "twine") return CATEGORY_VISUALS.pact;
  if (style === "muted") return CATEGORY_VISUALS.mystery;
  return {
    category: "hostile",
    paper: "#efe5cf",
    border: "rgba(92, 74, 52, 0.45)",
    ink: "#332a1e",
    accent: "#b83227",
    doubleFrame: false,
    sealDot: false,
    serif: false,
  };
}
