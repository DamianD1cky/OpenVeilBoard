import type { BoardRepository, Note } from "../domain/types";
import { defaultCampaignClock } from "../features/campaign/domain/campaignClock";
import { evaluateDice } from "../features/dice/engine";
import { errorText } from "../domain/boardStore";
export function createLocalRepository(campaignId: string): BoardRepository {
  const key = `veilboard:demo:${campaignId}`;
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      notes: demoNotes(campaignId),
      edges: [],
      clock: {
        ...defaultCampaignClock(new Date("1893-11-24T22:15:00")),
        running: false,
      },
      members: [{ userId: "demo", name: "守秘人", role: "gm" }],
    };
  };
  const write = (state: any) => {
    localStorage.setItem(key, JSON.stringify(state));
    listeners.forEach((fn) => fn());
  };
  const notify = (event: StorageEvent) => {
    if (event.key === key) listeners.forEach((fn) => fn());
  };
  return {
    async load() {
      return read();
    },
    async create(note) {
      const state = read();
      const saved = { ...note, imageUrl: note.imagePath };
      state.notes.push(saved);
      write(state);
      return saved;
    },
    async save(note, patch, expected) {
      const state = read(),
        current = state.notes.find((n: Note) => n.id === note.id);
      if (!current) throw new Error("便签已不存在。");
      if (
        Object.entries(expected).some(
          ([k, v]) => JSON.stringify(current[k]) !== JSON.stringify(v),
        )
      )
        throw new Error("NOTE_CONFLICT");
      const saved = {
        ...current,
        ...patch,
        imageUrl: "imagePath" in patch ? patch.imagePath : current.imageUrl,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      state.notes = state.notes.map((n: Note) =>
        n.id === note.id ? saved : n,
      );
      write(state);
      return saved;
    },
    async remove(id) {
      const s = read();
      s.notes = s.notes.filter((n: Note) => n.id !== id);
      s.edges = s.edges.filter(
        (e: any) => e.fromNoteId !== id && e.toNoteId !== id,
      );
      write(s);
    },
    async saveEdge(edge) {
      const s = read();
      s.edges = [...s.edges.filter((e: any) => e.id !== edge.id), edge];
      write(s);
      return edge;
    },
    async removeEdge(id) {
      const s = read();
      s.edges = s.edges.filter((e: any) => e.id !== id);
      write(s);
    },
    async saveClock(clock) {
      const s = read();
      s.clock = clock;
      write(s);
      return clock;
    },
    async roll(notation, label) {
      const library = await import("@dice-roller/rpg-dice-roller");
      return {
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        actor_id: "demo",
        actor_name: "守秘人",
        notation,
        label,
        result: evaluateDice(notation, library as any),
        visibility: "public",
        status: "complete",
        parent_id: null,
        check_id: null,
        revealed_at: null,
        created_at: new Date().toISOString(),
      };
    },
    subscribe(onChange) {
      listeners.add(onChange);
      window.addEventListener("storage", notify);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", notify);
      };
    },
    async imageUrl(path) {
      return path;
    },
    async comment(noteId, capabilityId, body, deleteId) {
      const state = read(),
        note = state.notes.find((n: Note) => n.id === noteId);
      if (!note) throw new Error("便签已不存在。");
      note.capabilities = note.capabilities.map((c: any) => {
        if (c.id !== capabilityId) return c;
        const entries = c.data.entries ?? [];
        return {
          ...c,
          data: {
            ...c.data,
            entries: deleteId
              ? entries.filter(
                  (e: any) => e.id !== deleteId || e.authorId !== "demo",
                )
              : [
                  ...entries,
                  {
                    id: crypto.randomUUID(),
                    authorId: "demo",
                    authorName: "守秘人",
                    body,
                    createdAt: new Date().toISOString(),
                  },
                ],
          },
        };
      });
      note.updatedAt = new Date().toISOString();
      note.version++;
      write(state);
      return note;
    },
    async upload(file) {
      if (file.size > 4 * 1024 * 1024) throw new Error("图片不能超过 4 MB。");
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error(errorText(r.error)));
        r.readAsDataURL(file);
      });
    },
  };
}
function demoNotes(campaignId: string) {
  const contents = [
    [
      "灰雾港 · 第七夜",
      "雨停之前，所有线索都留在这张桌上。\n午夜钟响后，旧码头会重新开门。",
      -0.27,
      -0.14,
      "dossier",
      "yellow",
      [
        {
          type: "checklist",
          data: {
            items: [
              { id: "a", text: "核对灯塔值班记录", done: true },
              { id: "b", text: "找到码头的第二把钥匙", done: false },
              { id: "c", text: "问询钟表匠", done: false },
            ],
          },
        },
      ],
    ],
    [
      "失踪的钟表匠",
      "最后目击：黑鸦巷 17 号。\n随身带着一只停止在 22:15 的怀表。\n邻居说，那晚听见了海浪。",
      0.02,
      -0.07,
      "note",
      "blue",
      [{ type: "comments", data: { entries: [] } }],
    ],
    [
      "潮水正在上涨",
      "码头仓库的窗口已经没入水中。\n当第六格填满，通往地下室的路将被淹没。",
      0.29,
      0.02,
      "urgent",
      "pink",
      [
        {
          type: "event_clock",
          data: {
            name: "涨潮",
            segments: 6,
            value: 3,
            mode: "progress",
            consequence: "地下室入口被淹没",
          },
        },
      ],
    ],
    [
      "一封未寄出的信",
      "「若你看见灯塔闪烁两次，\n请带上那枚铜扣。」\n落款处只有一个字母：V。",
      -0.15,
      0.24,
      "note",
      "yellow",
      [
        {
          type: "dice_action",
          data: { notation: "1d20+3", label: "解读密信", last: null },
        },
      ],
    ],
  ];
  const now = new Date().toISOString();
  return contents.map(
    ([title, body, x, y, cardStyle, color, capabilities], i) => ({
      id: `demo-note-${i}`,
      campaignId,
      title,
      body,
      x,
      y,
      cardStyle,
      color,
      rotation: [-5, 4, -3, 6][i],
      layer: i + 1,
      pinColor: i === 1 ? "blue" : "red",
      imagePath: null,
      imageUrl: null,
      capabilities: (capabilities as any[]).map((c) => ({
        ...c,
        enabled: true,
        id: crypto.randomUUID(),
      })),
      archivedAt: null,
      authorId: "demo",
      authorName: "守秘人",
      createdAt: now,
      updatedAt: now,
      version: 0,
    }),
  );
}
