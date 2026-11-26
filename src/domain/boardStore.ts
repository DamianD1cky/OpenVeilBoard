import { defaultCampaignClock } from "../features/campaign/domain/campaignClock.ts";
import type {
  CardStyle,
  BoardRepository,
  BoardSnapshot,
  Note,
  NoteEdge,
  NotePatch,
} from "./types";
export function createBoardStore(
  repository: BoardRepository,
  campaignId: string,
  actor: { id: string; name: string },
  placement?: (
    style: CardStyle,
    preferred?: { x: number; y: number },
  ) => { x: number; y: number },
) {
  let state: BoardSnapshot = {
    notes: [],
    edges: [],
    clock: defaultCampaignClock(),
    members: [],
    roll: null,
    loading: true,
    error: "",
  };
  const listeners = new Set<() => void>();
  const pending = new Map<string, NotePatch>();
  const pendingEdges = new Map<string, NoteEdge | null>();
  const chains = new Map<string, Promise<unknown>>();
  let disposed = false,
    loadVersion = 0,
    savedVersion = 0;
  const emit = (patch: Partial<BoardSnapshot>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  const replaceNote = (note: Note) =>
    emit({ notes: state.notes.map((n) => (n.id === note.id ? note : n)) });
  const sameEdge = (left: NoteEdge, right: NoteEdge) =>
    left.id === right.id ||
    (left.fromNoteId === right.fromNoteId &&
      left.toNoteId === right.toNoteId) ||
    (left.fromNoteId === right.toNoteId && left.toNoteId === right.fromNoteId);
  async function refresh() {
    if (disposed) return;
    const ticket = ++loadVersion;
    const revision = savedVersion;
    try {
      const next = await repository.load();
      if (disposed || ticket !== loadVersion) return;
      if (revision !== savedVersion) return refresh();
      // Realtime refreshes never overwrite a local object with an outstanding write.
      const notes = next.notes.map((n) => ({ ...n, ...pending.get(n.id) }));
      for (const note of state.notes)
        if (pending.has(note.id) && !notes.some((n) => n.id === note.id))
          notes.push(note);
      const optimisticEdges = [...pendingEdges.values()];
      const edges = next.edges.filter(
        (edge) =>
          !pendingEdges.has(edge.id) &&
          !optimisticEdges.some((item) => item && sameEdge(item, edge)),
      );
      for (const item of optimisticEdges) if (item) edges.push(item);
      emit({ ...next, notes, edges, loading: false, error: "" });
    } catch (cause) {
      if (!disposed && ticket === loadVersion)
        emit({ loading: false, error: errorText(cause) });
    }
  }
  function patch(
    id: string,
    changes: NotePatch,
    baseline?: Partial<Note>,
  ): Promise<void> {
    const before = state.notes.find((n) => n.id === id);
    if (!before) return Promise.reject(new Error("便签已不存在。"));
    if (changes.archivedAt === null && before.archivedAt && placement) {
      changes = {
        ...placement(before.cardStyle, { x: before.x, y: before.y }),
        ...changes,
      };
    }
    if (!Object.keys(changes).length) return Promise.resolve();
    const optimistic = { ...before, ...changes };
    pending.set(id, { ...pending.get(id), ...changes });
    replaceNote(optimistic);
    const predecessor = chains.get(id) ?? Promise.resolve();
    const write = predecessor
      .catch(() => {})
      .then(async () => {
        if (disposed) throw new Error("ROOM_CHANGED");
        const expected = Object.fromEntries(
          Object.keys(changes).map((key) => [
            key,
            baseline && Object.hasOwn(baseline, key)
              ? baseline[key as keyof Note]
              : before[key as keyof Note],
          ]),
        );
        try {
          const saved = await repository.save(optimistic, changes, expected);
          savedVersion++;
          const outstanding = { ...pending.get(id) };
          for (const key of Object.keys(changes) as (keyof NotePatch)[]) {
            if (Object.is(outstanding[key], changes[key]))
              delete outstanding[key];
          }
          if (Object.keys(outstanding).length) pending.set(id, outstanding);
          else pending.delete(id);
          replaceNote({ ...saved, ...outstanding });
        } catch (cause) {
          pending.delete(id);
          emit({ error: errorText(cause) });
          await refresh();
          throw cause;
        }
      });
    chains.set(id, write);
    void write
      .finally(() => {
        if (chains.get(id) === write) chains.delete(id);
      })
      .catch(() => {});
    return write;
  }
  async function create(changes: NotePatch = {}) {
    const now = new Date().toISOString();
    const position = placement?.(changes.cardStyle ?? "note") ?? { x: 0, y: 0 };
    const note: Note = {
      id: crypto.randomUUID(),
      campaignId,
      title: "新便签",
      body: "",
      x: position.x,
      y: position.y,
      rotation: Math.random() * 8 - 4,
      layer: Math.max(0, ...state.notes.map((n) => n.layer)) + 1,
      cardStyle: "note",
      color: "yellow",
      pinColor: "red",
      imagePath: null,
      imageUrl: null,
      media: [],
      burn: null,
      capabilities: [],
      archivedAt: null,
      authorId: actor.id,
      authorName: actor.name,
      createdAt: now,
      updatedAt: now,
      version: 0,
      ...changes,
    };
    pending.set(note.id, changes);
    emit({ notes: [...state.notes, note] });
    const write = repository.create(note);
    chains.set(note.id, write);
    try {
      const saved = await write;
      savedVersion++;
      const outstanding = { ...pending.get(note.id) };
      for (const key of Object.keys(changes) as (keyof NotePatch)[])
        if (Object.is(outstanding[key], changes[key])) delete outstanding[key];
      if (Object.keys(outstanding).length) pending.set(note.id, outstanding);
      else pending.delete(note.id);
      replaceNote({ ...saved, ...outstanding });
      return saved;
    } catch (cause) {
      pending.delete(note.id);
      emit({
        notes: state.notes.filter((n) => n.id !== note.id),
        error: errorText(cause),
      });
      throw cause;
    } finally {
      if (chains.get(note.id) === write) chains.delete(note.id);
    }
  }
  async function writeEdge(item: NoteEdge, remove = false) {
    if (pendingEdges.has(item.id))
      throw new Error("连线正在保存，请稍后再试。");
    const before = state.edges.find((edge) => sameEdge(edge, item));
    const others = () => state.edges.filter((edge) => !sameEdge(edge, item));
    pendingEdges.set(item.id, remove ? null : item);
    emit({ edges: remove ? others() : [...others(), item] });
    try {
      const saved = remove
        ? (await repository.removeEdge(item.id), null)
        : await repository.saveEdge(item);
      savedVersion++;
      pendingEdges.delete(item.id);
      const edges = others().filter((edge) => !saved || !sameEdge(edge, saved));
      emit({ edges: saved ? [...edges, saved] : edges });
      return saved;
    } catch (cause) {
      pendingEdges.delete(item.id);
      const edges = others();
      emit({
        edges: before ? [...edges, before] : edges,
        error: errorText(cause),
      });
      throw cause;
    }
  }
  async function edge(from: string, to: string): Promise<NoteEdge | null> {
    if (from === to) return null;
    const item: NoteEdge = {
      id: crypto.randomUUID(),
      fromNoteId: from,
      toNoteId: to,
      label: "",
      color: "#b83227",
      style: "rope",
    };
    const existing = state.edges.find((entry) => sameEdge(entry, item));
    if (existing) return existing;
    return (await writeEdge(item)) ?? item;
  }
  const unsubscribe = repository.subscribe(
    () => void refresh(),
    (roll) => emit({ roll }),
  );
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    refresh,
    patch,
    create,
    edge,
    repository,
    clearError: () => emit({ error: "" }),
    async comment(
      noteId: string,
      capabilityId: string,
      body: string,
      deleteId?: string,
    ) {
      const saved = await repository.comment(
        noteId,
        capabilityId,
        body,
        deleteId,
      );
      savedVersion++;
      replaceNote(saved);
      return saved;
    },
    async remove(id: string) {
      await repository.remove(id);
      savedVersion++;
      emit({
        notes: state.notes.filter((n) => n.id !== id),
        edges: state.edges.filter(
          (e) => e.fromNoteId !== id && e.toNoteId !== id,
        ),
      });
    },
    updateEdge: (item: NoteEdge) => writeEdge(item),
    async removeEdge(id: string) {
      const item = state.edges.find((edge) => edge.id === id);
      if (item) await writeEdge(item, true);
    },
    async clock(clock: BoardSnapshot["clock"]) {
      const saved = await repository.saveClock(clock);
      savedVersion++;
      emit({ clock: saved });
    },
    async roll(notation: string, label = "") {
      const roll = await repository.roll(notation, label);
      emit({ roll });
      return roll;
    },
    dismissRoll: () => emit({ roll: null }),
    dispose() {
      disposed = true;
      unsubscribe();
      listeners.clear();
    },
  };
}
export type BoardStore = ReturnType<typeof createBoardStore>;
export function errorText(cause: unknown) {
  const text = cause instanceof Error ? cause.message : String(cause);
  if (/NOTE_CONFLICT/.test(text))
    return "这张便签已被其他成员修改，请根据最新内容重试。";
  if (/PGRST202|does not exist|服务器尚未部署/.test(text))
    return "服务器尚未部署 VeilBoard 增量迁移。";
  if (/NOT_EDITABLE|ROLE_REQUIRED/.test(text))
    return "你没有修改这项内容的权限。";
  return text;
}
