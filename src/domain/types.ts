import type { CampaignClockConfig } from "../features/campaign/domain/campaignClock";
import type { DiceRoll } from "../features/dice/types";
export type CapabilityType = "event_clock" | "dice_action" | "secret";
export type CardStyle = "polaroid" | "note" | "dossier" | "urgent";
export type PinColor = "red" | "blue" | "green" | "yellow" | "black";
export type BurnMode = "none" | "scorched" | "burning";
export type BurnTopology = "corner" | "bottom" | "perimeter" | "point";
export interface NoteBurnConfig {
  mode: BurnMode;
  topology: BurnTopology;
  progress: number;
  origin: [number, number];
  glowIntensity?: number;
  seed?: number;
}
export interface NoteMediaItem {
  id: string;
  path: string;
  url?: string | null;
  caption?: string;
  aspect?: number;
}
export interface SurfaceTheme {
  presetId: string;
  framePreset?: string;
  trayPreset?: string;
  frameColor?: string;
  trayColor?: string;
}
export type GoboPattern = "flora" | "blinds" | "window" | "lamp" | "none";
export interface LightingState {
  presetId: string;
  azimuth: number;
  elevation: number;
  warmth: number;
  brightness: number;
  contrast: number;
  goboPattern: GoboPattern;
  goboOpacity: number;
  goboSoft: number;
  goboSway: number;
  dustEnabled: boolean;
  clouds: boolean;
}
export interface NoteCapability<T = Record<string, any>> {
  id: string;
  type: CapabilityType;
  enabled: boolean;
  data: T;
}
export interface Note {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  x: number;
  y: number;
  rotation: number;
  layer: number;
  cardStyle: CardStyle;
  color: string;
  pinColor: PinColor;
  imagePath: string | null;
  imageUrl: string | null;
  media?: NoteMediaItem[];
  burn?: NoteBurnConfig | null;
  capabilities: NoteCapability[];
  archivedAt: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface NoteEdge {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  label: string;
  color: string;
  style: "rope" | "twine" | "gold" | "muted";
}
export interface Member {
  userId: string;
  name: string;
  role: "gm" | "player" | "observer";
}
export interface BoardSnapshot {
  notes: Note[];
  edges: NoteEdge[];
  clock: CampaignClockConfig;
  members: Member[];
  roll: DiceRoll | null;
  loading: boolean;
  error: string;
}
export type NotePatch = Partial<
  Pick<
    Note,
    | "title"
    | "body"
    | "x"
    | "y"
    | "rotation"
    | "cardStyle"
    | "color"
    | "pinColor"
    | "imagePath"
    | "media"
    | "burn"
    | "capabilities"
    | "archivedAt"
  >
>;
export interface BoardRepository {
  load(): Promise<Omit<BoardSnapshot, "loading" | "error" | "roll">>;
  save(note: Note, patch: NotePatch, expected: Partial<Note>): Promise<Note>;
  create(note: Note): Promise<Note>;
  remove(id: string): Promise<void>;
  saveEdge(edge: NoteEdge): Promise<NoteEdge>;
  removeEdge(id: string): Promise<void>;
  saveClock(clock: CampaignClockConfig): Promise<CampaignClockConfig>;
  roll(notation: string, label: string): Promise<DiceRoll>;
  subscribe(onChange: () => void, onRoll: (roll: DiceRoll) => void): () => void;
  imageUrl(path: string): Promise<string>;
  upload(file: File): Promise<string>;
  comment(
    noteId: string,
    capabilityId: string,
    body: string,
    deleteId?: string,
  ): Promise<Note>;
}
