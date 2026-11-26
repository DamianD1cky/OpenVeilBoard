import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ActiveCampaignAccess,
  AppSession,
} from "../features/access/domain/types";
import { createBoardStore, errorText } from "../domain/boardStore";
import { createSupabaseRepository } from "../data/supabaseRepository";
import { createLocalRepository } from "../data/localRepository";
import { FallbackBoard2D, type BoardCallbacks } from "./FallbackBoard2D";
import { Inspector } from "./Inspector";
import { ArchiveDrawer } from "./ArchiveDrawer";
import { HoverDeck } from "./HoverDeck";
import { ClockDialog } from "./ClockDialog";
import { EdgeDialog } from "./EdgeDialog";
import { PaperDialog, type IndentRect } from "./PaperDialog";
import {
  SurfaceThemeDrawer,
  type SurfaceDrawerTab,
} from "./SurfaceThemeDrawer";
import { TrayOverlay, TRAY_MENU_ZONES } from "./TrayOverlay";
import { usePresence, usePreservedValue } from "./usePresence";
import { canReadNote } from "../domain/capabilityRegistry";
import { playSound } from "../features/audio/audioEngine.js";
import {
  applyTrayInkTokens,
  loadSavedSurfaceTheme,
  resolveSurfaceTheme,
  saveSurfaceTheme,
} from "../scene/surfacePresets.js";
import {
  loadSavedLighting,
  saveLighting,
} from "../scene/lightingPresets.js";
import { boardPlacement } from "./boardPlacement";
import {
  getBoardRoute,
  navigateBoard,
  subscribeBoardRoute,
} from "../shared/navigation";
import type { LightingState, NoteEdge, SurfaceTheme } from "../domain/types";
import type { DiceRoll } from "../features/dice/types";
import {
  RELATION_PRESETS,
  formatEdgeLabel,
  type EdgeDirection,
} from "../domain/edgeRelations";

const DICE_PRESETS = [
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "1d12",
  "1d20",
  "1d100",
  "2d6",
];

const DICE_MATERIALS = [
  { id: "ivory", label: "象牙白" },
  { id: "obsidian", label: "黑曜石金" },
  { id: "brass", label: "复古黄铜" },
  { id: "jade", label: "深绿翡翠" },
];

export function Board({
  room,
  session,
  scene,
  demo,
  accountOpen = false,
  onRooms,
  onAccount,
  onCloseAccount,
}: {
  room: ActiveCampaignAccess;
  session: AppSession;
  scene: any;
  demo: boolean;
  accountOpen?: boolean;
  onRooms: () => void;
  onAccount: () => void;
  onCloseAccount?: () => void;
}) {
  const placementScene = useRef(scene);
  placementScene.current = scene;
  const store = useMemo(
    () =>
      createBoardStore(
        demo
          ? createLocalRepository(room.campaignId)
          : createSupabaseRepository(room.campaignId),
        room.campaignId,
        { id: session.user.id, name: session.user.displayName },
        (style, preferred) =>
          boardPlacement(style, placementScene.current, preferred),
      ),
    [room.campaignId, session.user.id, demo],
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const route = useSyncExternalStore(subscribeBoardRoute, getBoardRoute);
  const [overlay, setOverlay] = useState<"clock" | "dice" | "surface" | null>(
    null,
  );
  const [surfaceTab, setSurfaceTab] = useState<SurfaceDrawerTab>("surface");
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceTheme>(() =>
    loadSavedSurfaceTheme(room.campaignId),
  );
  const [lighting, setLighting] = useState<LightingState>(
    () => loadSavedLighting(room.campaignId) as LightingState,
  );
  const lightingImmediateRef = useRef(true);
  useEffect(() => {
    setSurfaceTheme(loadSavedSurfaceTheme(room.campaignId));
    lightingImmediateRef.current = true;
    setLighting(loadSavedLighting(room.campaignId) as LightingState);
  }, [room.campaignId]);
  useEffect(() => {
    applyTrayInkTokens(surfaceTheme, lighting);
    void scene?.setSurfaceTheme?.(surfaceTheme);
  }, [scene, surfaceTheme, lighting]);
  useEffect(() => {
    const immediate = lightingImmediateRef.current;
    lightingImmediateRef.current = false;
    scene?.setLighting?.(lighting, { immediate });
  }, [scene, lighting]);
  const [indentRect, setIndentRect] = useState<IndentRect | null>(null);
  const [edge, setEdge] = useState<NoteEdge | null>(null),
    [quickEdge, setQuickEdge] = useState<NoteEdge | null>(null),
    [quickText, setQuickText] = useState(""),
    [quickDir, setQuickDir] = useState<EdgeDirection>("none"),
    [hovered, setHovered] = useState<string | null>(null),
    [pinHovered, setPinHovered] = useState<string | null>(null),
    [diceBtnHovered, setDiceBtnHovered] = useState<string | null>(null),
    [clockBtnHovered, setClockBtnHovered] = useState<{
      noteId: string;
      action: "plus" | "minus" | "toggle";
      delta: number;
    } | null>(null),
    [floorClockOverride, setFloorClockOverride] = useState<
      { mode: "hidden" } | { mode: "pin"; key: string } | null
    >(null),
    [archivePullId, setArchivePullId] = useState<string | null>(null),
    [linkStart, setLinkStart] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [formula, setFormula] = useState("1d20"),
    [material, setMaterial] = useState("ivory"),
    [result, setResult] = useState<DiceRoll | null>(null),
    [rolling, setRolling] = useState(false),
    [savingRollNote, setSavingRollNote] = useState(false),
    [diceDocked, setDiceDocked] = useState(false),
    [hoveredDice, setHoveredDice] = useState<{
      notation: string;
      label: string;
      count: number;
    } | null>(null);
  const [hoverBlocked, setHoverBlocked] = useState(false);
  useEffect(() => {
    const hide = () => {
      setHovered(null);
      setHoverBlocked(true);
    };
    window.addEventListener("pointerdown", hide, true);
    return () => window.removeEventListener("pointerdown", hide, true);
  }, []);
  const [roomMenu, setRoomMenu] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (accountOpen) {
      setRoomMenu(false);
      setOverlay(null);
      setEdge(null);
    }
  }, [accountOpen]);
  useEffect(() => {
    if (route.kind !== "home" && accountOpen) {
      onCloseAccount?.();
    }
  }, [route.kind, accountOpen, onCloseAccount]);
  const lastRoll = useRef<string | null>(null),
    lastRollMeta = useRef<{ notation: string; label: string } | null>(null),
    rollFromCorner = useRef(false),
    sourceNote = useRef<string | undefined>(undefined),
    bridge = useRef<BoardCallbacks>(null!);
  const safe = (operation: Promise<unknown>) =>
    void operation.catch((cause) => setError(errorText(cause)));
  const close = (target?: "/" | "/archive") => {
    setOverlay(null);
    setEdge(null);
    setRoomMenu(false);
    const liveRoute = getBoardRoute();
    if (liveRoute.kind !== "home") {
      if (target === "/" || target === "/archive") {
        navigateBoard(target);
        return;
      }
      const inspected =
        liveRoute.kind === "note"
          ? store.getSnapshot().notes.find((n) => n.id === liveRoute.noteId)
          : null;
      navigateBoard(inspected?.archivedAt ? "/archive" : "/");
    }
  };
  const inspect = (id: string) => {
    setOverlay(null);
    setEdge(null);
    setRoomMenu(false);
    setHovered(null);
    navigateBoard(`/note/${encodeURIComponent(id)}`);
  };
  async function roll(
    notation: string,
    label = "",
    noteId?: string,
    fromCorner = false,
  ) {
    sourceNote.current = noteId;
    rollFromCorner.current = fromCorner;
    lastRollMeta.current = { notation, label };
    setRolling(true);
    setHoveredDice(null);
    setError("");
    try {
      const dice = await store.roll(notation, label);
      close();
      if (noteId) {
        const note = store.getSnapshot().notes.find((n) => n.id === noteId);
        if (note && (note.authorId === session.user.id || room.role === "gm"))
          await store.patch(noteId, {
            capabilities: note.capabilities.map((c) =>
              c.type === "dice_action"
                ? { ...c, data: { ...c.data, last: dice.result?.total } }
                : c,
            ),
          });
      }
    } catch (cause) {
      rollFromCorner.current = false;
      setError(errorText(cause));
    } finally {
      setRolling(false);
    }
  }
  async function saveRollAsPolaroid(rollRecord: DiceRoll) {
    if (!rollRecord.result || savingRollNote) return;
    setSavingRollNote(true);
    setError("");
    try {
      const snapshotFile = await scene?.captureDiceSnapshot?.().catch(() => null);
      let imagePath: string | null = null;
      let imageUrl: string | null = null;
      if (snapshotFile) {
        try {
          imagePath = await store.repository.upload(snapshotFile);
          imageUrl = await store.repository.imageUrl(imagePath);
        } catch (uploadCause) {
          setError(`现场照片上传失败，已仅保存点数：${errorText(uploadCause)}`);
        }
      }
      setResult(null);
      scene?.dice?.tidyToCorner?.();
      const total = rollRecord.result.total;
      const title = rollRecord.label
        ? `${rollRecord.label} · ${total}`
        : `投骰留影 · ${rollRecord.notation} = ${total}`;
      const body = [
        `公式：${rollRecord.notation}`,
        `明细：${rollRecord.result.output}`,
        `总点数：${total}`,
      ].join("\n");
      await store.create({
        title,
        body,
        cardStyle: imagePath ? "polaroid" : "dossier",
        imagePath,
        media: imagePath
          ? [
              {
                id: `dice-${rollRecord.id}`,
                path: imagePath,
                url: imageUrl,
                caption: `${rollRecord.notation} = ${total}`,
              },
            ]
          : [],
        capabilities: [],
      });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSavingRollNote(false);
    }
  }
  const connect = (id: string | null) => {
    const startId = linkStart;
    setLinkStart(null);
    if (id && startId && id !== startId) {
      playSound("polaroid.dock", { volume: 0.3, rate: 1.25 });
      void store
        .edge(startId, id)
        .then((created) => {
          if (created) {
            setQuickEdge(created);
            setQuickText("");
            setQuickDir("none");
          }
        })
        .catch((cause) => setError(errorText(cause)));
    }
  };
  const applyQuickEdge = async (
    label: string,
    style: NoteEdge["style"],
    color: string,
    dir: EdgeDirection = quickDir,
  ) => {
    if (!quickEdge) return;
    const target = quickEdge;
    setQuickEdge(null);
    setQuickText("");
    playSound("polaroid.dock", { volume: 0.22, rate: 1.38 });
    try {
      await store.updateEdge({
        ...target,
        label: formatEdgeLabel(label, dir),
        style,
        color,
      });
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  const handlePinClick = (id: string) => {
    if (room.role === "observer") return;
    if (!linkStart) {
      playSound("polaroid.dock", { volume: 0.24, rate: 1.5 });
      setLinkStart(id);
      return;
    }
    if (linkStart === id) {
      setLinkStart(null);
      return;
    }
    connect(id);
  };
  const stepEventClock = (noteId: string, capId: string, delta: number) => {
    const note = store.getSnapshot().notes.find((n) => n.id === noteId);
    if (!note) return;
    let changed = false;
    const nextCaps = note.capabilities.map((c) => {
      if (c.id !== capId || c.type !== "event_clock") return c;
      const segs = Math.max(2, Math.min(24, Number(c.data?.segments) || 6));
      const cur = Math.max(0, Math.min(segs, Number(c.data?.value) || 0));
      const nextVal = Math.max(0, Math.min(segs, cur + delta));
      if (nextVal === cur) return c;
      changed = true;
      return { ...c, data: { ...c.data, value: nextVal } };
    });
    if (!changed) return;
    playSound("polaroid.dock", {
      volume: 0.28,
      rate: delta > 0 ? 1.45 : 1.05,
    });
    safe(store.patch(noteId, { capabilities: nextCaps }));
  };
  const floorClockItems = useMemo(() => {
    const items: Array<{
      key: string;
      noteId: string;
      capId: string;
      noteTitle: string;
      name: string;
      segments: number;
      value: number;
      consequence: string;
      primary: boolean;
    }> = [];
    for (const note of state.notes) {
      if (note.archivedAt) continue;
      if (!canReadNote(note, session.user.id, room.role)) continue;
      for (const cap of note.capabilities) {
        if (!cap.enabled || cap.type !== "event_clock") continue;
        if (cap.data?.pinned === false) continue;
        const segments = Math.max(2, Math.min(24, Number(cap.data?.segments) || 6));
        const value = Math.max(0, Math.min(segments, Number(cap.data?.value) || 0));
        items.push({
          key: `${note.id}:${cap.id}`,
          noteId: note.id,
          capId: cap.id,
          noteTitle: note.title,
          name: String(cap.data?.name || note.title || "事件钟").trim(),
          segments,
          value,
          consequence: String(cap.data?.consequence || "").trim(),
          primary: Boolean(cap.data?.primary),
        });
      }
    }
    return items;
  }, [state.notes, session.user.id, room.role]);
  const syncedPrimaryClock = useMemo(() => {
    if (!floorClockItems.length) return null;
    return (
      floorClockItems.find((c) => c.primary) ??
      [...floorClockItems].sort((a, b) => b.value / b.segments - a.value / a.segments)[0]
    );
  }, [floorClockItems]);
  const activeFloorClock = useMemo(() => {
    if (floorClockOverride?.mode === "hidden") return null;
    if (floorClockOverride?.mode === "pin") {
      return (
        floorClockItems.find((c) => c.key === floorClockOverride.key) ??
        syncedPrimaryClock
      );
    }
    return syncedPrimaryClock;
  }, [floorClockOverride, floorClockItems, syncedPrimaryClock]);
  const toggleCardClockBackdrop = (noteId: string) => {
    const notes = store.getSnapshot().notes;
    const target = notes.find((n) => n.id === noteId && !n.archivedAt);
    const clockCap = target?.capabilities.find(
      (c) => c.enabled && c.type === "event_clock",
    );
    if (!target || !clockCap) return;
    const key = `${target.id}:${clockCap.id}`;
    playSound("polaroid.dock", { volume: 0.2, rate: 1.24 });
    if (activeFloorClock?.key === key) {
      setFloorClockOverride({ mode: "hidden" });
      return;
    }
    if (room.role === "gm") {
      setFloorClockOverride(null);
      for (const note of notes) {
        if (note.archivedAt) continue;
        let dirty = false;
        const nextCaps = note.capabilities.map((c) => {
          if (c.type !== "event_clock") return c;
          const shouldBePrimary = note.id === target.id && c.id === clockCap.id;
          const nextPinned = shouldBePrimary ? true : c.data?.pinned;
          if (
            Boolean(c.data?.primary) !== shouldBePrimary ||
            c.data?.pinned !== nextPinned
          ) {
            dirty = true;
            return {
              ...c,
              data: {
                ...c.data,
                pinned: nextPinned,
                primary: shouldBePrimary,
              },
            };
          }
          return c;
        });
        if (dirty) safe(store.patch(note.id, { capabilities: nextCaps }));
      }
    } else {
      setFloorClockOverride({ mode: "pin", key });
    }
  };
  bridge.current = {
    canEdit: (note) =>
      room.role !== "observer" &&
      (note.authorId === session.user.id || room.role === "gm"),
    canLink: () => room.role !== "observer",
    canRoll: () => room.role !== "observer",
    onSelect: (id) => {
      if (linkStart) {
        if (linkStart === id) setLinkStart(null);
        else connect(id);
      } else inspect(id);
    },
    onHover: (id) => {
      setHovered(id);
      if (id) setHoverBlocked(false);
    },
    onPinHover: (id) => {
      setPinHovered(id);
    },
    onPinClick: (id) => {
      handlePinClick(id);
    },
    onDiceButtonHover: (id) => {
      setDiceBtnHovered(id);
    },
    onClockButtonHover: (hit) => {
      setClockBtnHovered(hit);
    },
    onCardStepClock: (id, delta) => {
      const target = store.getSnapshot().notes.find((n) => n.id === id);
      if (!target || !bridge.current.canEdit(target)) return;
      const clockCap = target.capabilities.find(
        (c) => c.enabled && c.type === "event_clock",
      );
      if (!clockCap) return;
      stepEventClock(target.id, clockCap.id, delta);
    },
    onCardToggleClockBackdrop: (id) => {
      toggleCardClockBackdrop(id);
    },
    onCardRoll: (id) => {
      if (room.role === "observer" || rolling) return;
      const target = store.getSnapshot().notes.find((n) => n.id === id);
      const diceCap = target?.capabilities.find(
        (c) => c.enabled && c.type === "dice_action",
      );
      if (!target || !diceCap) return;
      void roll(
        String(diceCap.data?.notation || "1d20"),
        String(diceCap.data?.label || target.title || ""),
        target.id,
      );
    },
    onPointerDown: () => {
      setHoverBlocked(true);
      setHovered(null);
      setResult(null);
      setQuickEdge(null);
    },
    onMove: (id, point) => safe(store.patch(id, point)),
    onArchive: (id) =>
      safe(store.patch(id, { archivedAt: new Date().toISOString() })),
    onRestore: (id) => safe(store.patch(id, { archivedAt: null })),
    onOpenArchive: () => {
      setOverlay(null);
      setEdge(null);
      setRoomMenu(false);
      setHovered(null);
      navigateBoard("/archive");
    },
    onCloseArchive: () => {
      setHovered(null);
      setArchivePullId(null);
      navigateBoard("/");
    },
    onArchivePull: (id) => {
      setArchivePullId(id);
    },
    onClock: () => {
      onCloseAccount?.();
      setRoomMenu(false);
      setEdge(null);
      setOverlay("clock");
    },
    onEdge: (nextEdge) => {
      onCloseAccount?.();
      setRoomMenu(false);
      setOverlay(null);
      setHovered(null);
      setEdge(nextEdge);
    },
    onBlank: () => {
      setLinkStart(null);
      setResult(null);
      scene?.dice.tidyToCorner();
    },
    onLinkStart: (id) => {
      if (room.role !== "observer") {
        setLinkStart(id);
      }
    },
    onLinkEnd: connect,
    onDiceHover: (info) => setHoveredDice(info),
    onDiceReroll: () => {
      if (rolling) return;
      const meta = lastRollMeta.current ?? scene?.dice?.getLastRollInfo?.();
      if (meta?.notation) {
        void roll(meta.notation, meta.label || "", undefined, true);
      } else {
        setOverlay("dice");
      }
    },
    onDiceMenu: () => {
      setRoomMenu(false);
      setEdge(null);
      setOverlay("dice");
    },
  };
  useEffect(() => {
    void store.refresh();
    return () => store.dispose();
  }, [store]);
  useEffect(() => {
    if (!scene) return;
    Object.keys(bridge.current).forEach(
      (name) =>
        (scene.callbacks[name] = (...args: any[]) =>
          (bridge.current as any)[name](...args)),
    );
    scene.callbacks.onDiceSettled = (dice: DiceRoll) => setResult(dice);
    scene.callbacks.onDiceState = (next: string) => {
      setDiceDocked(next === "docked");
      if (next !== "docked") setHoveredDice(null);
    };
    scene.enter(true);
    localStorage.setItem(`veilboard:visited:${session.user.id}`, "1");
    return () => {
      scene.setAvoidanceZone?.(null);
      scene.setEventClock?.(null);
      scene.setRouteView?.(false);
      scene.setUI(false);
      scene.sync({ notes: [], edges: [], clock: state.clock });
      scene.dice.clear(true);
    };
  }, [scene, room.campaignId]);
  useEffect(() => {
    scene?.sync(state);
  }, [scene, state.notes, state.edges, state.clock]);
  const isArchiveView = route.kind === "archive";
  const activeModal = Boolean(
    (route.kind !== "home" && !isArchiveView) ||
      overlay ||
      edge ||
      roomMenu ||
      accountOpen,
  );
  const activeAvoidZone = useMemo(() => {
    if (route.kind !== "home") return null;
    if (accountOpen) return TRAY_MENU_ZONES.account;
    if (overlay === "dice") return TRAY_MENU_ZONES.dice;
    if (overlay === "surface") return TRAY_MENU_ZONES.surface;
    if (overlay === "clock") return TRAY_MENU_ZONES.clock;
    if (edge) return TRAY_MENU_ZONES.edge;
    if (roomMenu) return TRAY_MENU_ZONES.roomMenu;
    return null;
  }, [route.kind, accountOpen, overlay, edge, roomMenu]);
  useEffect(() => {
    scene?.setAvoidanceZone?.(activeAvoidZone);
  }, [scene, activeAvoidZone]);
  useEffect(() => {
    if (activeModal) {
      setHoveredDice(null);
      setPinHovered(null);
      setDiceBtnHovered(null);
      setClockBtnHovered(null);
      setLinkStart(null);
      setQuickEdge(null);
    }
  }, [activeModal]);
  useEffect(() => {
    if (!linkStart && !quickEdge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setLinkStart(null);
        setQuickEdge(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [linkStart, quickEdge]);
  useEffect(() => {
    if (!scene?.onIndentRect) {
      setIndentRect(null);
      return;
    }
    return scene.onIndentRect((rect: IndentRect | null) => setIndentRect(rect));
  }, [scene]);
  useEffect(() => {
    scene?.setUI(true, activeModal, false);
  }, [scene, activeModal]);
  useEffect(() => {
    scene?.setRouteView?.(route.kind !== "home");
  }, [scene, route.kind]);
  useEffect(() => {
    scene?.setLinkStart?.(linkStart);
    if (!linkStart) scene?.rope?.highlight?.(null);
  }, [scene, linkStart]);
  useEffect(() => {
    if (quickEdge) scene?.rope?.highlightEdge?.(quickEdge.id);
    else if (!linkStart) scene?.rope?.highlightEdge?.(null);
  }, [scene, quickEdge, linkStart]);
  useEffect(() => {
    if (!state.roll?.result || state.roll.id === lastRoll.current) return;
    lastRoll.current = state.roll.id;
    lastRollMeta.current = {
      notation: state.roll.notation,
      label: state.roll.label || "",
    };
    const fromCorner = rollFromCorner.current;
    rollFromCorner.current = false;
    if (scene) scene.dice.throw(state.roll, material, { fromCorner });
    else setResult(state.roll);
  }, [state.roll, scene, material]);
  const hoverNote = state.notes.find((n) => n.id === hovered) ?? null;
  const pullNote = archivePullId
    ? (state.notes.find((n) => n.id === archivePullId) ?? null)
    : null;
  const linkStartNote = linkStart
    ? (state.notes.find((n) => n.id === linkStart) ?? null)
    : null;
  const pinHoverNote = pinHovered
    ? (state.notes.find((n) => n.id === pinHovered) ?? null)
    : null;
  const diceBtnNote = diceBtnHovered
    ? (state.notes.find((n) => n.id === diceBtnHovered) ?? null)
    : null;
  const diceBtnCap = diceBtnNote?.capabilities.find(
    (c) => c.enabled && c.type === "event_clock" ? false : c.enabled && c.type === "dice_action",
  );
  const clockBtnNote = clockBtnHovered
    ? (state.notes.find((n) => n.id === clockBtnHovered.noteId) ?? null)
    : null;
  const clockBtnCap = clockBtnNote?.capabilities.find(
    (c) => c.enabled && c.type === "event_clock",
  );
  const clockBtnHint = (() => {
    if (!clockBtnNote || !clockBtnCap || !clockBtnHovered) return null;
    const segs = Math.max(2, Math.min(24, Number(clockBtnCap.data?.segments) || 6));
    const cur = Math.max(0, Math.min(segs, Number(clockBtnCap.data?.value) || 0));
    const name = String(clockBtnCap.data?.name || clockBtnNote.title || "事件钟");
    if (clockBtnHovered.action === "toggle") {
      const key = `${clockBtnNote.id}:${clockBtnCap.id}`;
      return activeFloorClock?.key === key
        ? `点击隐藏「${name}」台面底纹`
        : `点击将「${name}」投射为台面底纹`;
    }
    const next = Math.max(0, Math.min(segs, cur + clockBtnHovered.delta));
    if (next === cur) {
      return `${name} 已达${clockBtnHovered.delta > 0 ? "满格" : "起点"} · ${cur}/${segs}`;
    }
    return `点击${clockBtnHovered.delta > 0 ? "推进" : "回退"}「${name}」· ${cur}/${segs} → ${next}/${segs}`;
  })();
  const pinHint = pullNote
    ? `松手将「${pullNote.title}」放回台面`
    : isArchiveView && hoverNote
      ? `${hoverNote.title} · 点击检视${room.role !== "observer" && (hoverNote.authorId === session.user.id || room.role === "gm") ? " · 右键或拖出放回台面" : ""}`
      : linkStartNote
        ? pinHoverNote && pinHoverNote.id !== linkStartNote.id
          ? `点击系牢至「${pinHoverNote.title}」 · Esc 取消`
          : `已系住「${linkStartNote.title}」图钉 · 点击另一枚图钉连线 · Esc 取消`
        : pinHoverNote
          ? `点击「${pinHoverNote.title}」图钉连线`
          : clockBtnHint
            ? clockBtnHint
            : diceBtnNote && diceBtnCap
              ? `点击直接投掷 · ⚄ ${diceBtnCap.data?.label ? `${diceBtnCap.data.label} ` : ""}${diceBtnCap.data?.notation || "1d20"}`
              : null;
  const selectedId = route.kind === "note" ? route.noteId : null;
  const currentNote = selectedId
    ? (state.notes.find((n) => n.id === selectedId) ?? null)
    : null;
  const isDarkTray = Boolean(
    resolveSurfaceTheme(surfaceTheme).tray.isDark ||
      lighting.brightness < 0.86 ||
      (lighting.brightness < 0.94 && lighting.contrast > 1.25),
  );
  const showCornerBar = route.kind === "home";
  const roomMenuOpen = roomMenu && showCornerBar;
  const roomMenuPresence = usePresence(roomMenuOpen, 185);
  const surfacePresence = usePresence(overlay === "surface", 185);
  const clockPresence = usePresence(overlay === "clock", 185);
  const dicePresence = usePresence(overlay === "dice", 185);
  const edgePresence = usePresence(Boolean(edge), 185);
  const edgeShown = usePreservedValue(edge, Boolean(edge));
  const archivePresence = usePresence(route.kind === "archive", 185);
  const quickEdgeOpen = Boolean(quickEdge && !activeModal && room.role !== "observer");
  const quickEdgePresence = usePresence(quickEdgeOpen, 155);
  const quickEdgeShown = usePreservedValue(quickEdge, quickEdgeOpen);
  const dockHintOpen = Boolean(
    hoveredDice && !activeModal && !isArchiveView && diceDocked,
  );
  const dockHintPresence = usePresence(dockHintOpen, 145);
  const dockHintShown = usePreservedValue(hoveredDice, dockHintOpen);
  const resultOpen = Boolean(result?.result && !activeModal && !isArchiveView);
  const resultPresence = usePresence(resultOpen, 155);
  const resultShown = usePreservedValue(result, resultOpen);
  const floorClockHidden =
    !showCornerBar ||
    Boolean(
      overlay === "clock" ||
        overlay === "surface" ||
        overlay === "dice" ||
        edge ||
        accountOpen,
    );
  useEffect(() => {
    scene?.setEventClock?.(floorClockHidden ? null : activeFloorClock);
  }, [scene, floorClockHidden, activeFloorClock]);
  const cornerBarStyle = indentRect
    ? {
        left: `${indentRect.left + 28}px`,
        top: `${indentRect.top + 22}px`,
        width: `${Math.max(220, indentRect.width - 56)}px`,
        right: "auto",
      }
    : undefined;
  const dockHintStyle = indentRect
    ? {
        left: `${indentRect.left + 26}px`,
        bottom: `${Math.max(24, window.innerHeight - (indentRect.top + indentRect.height) + 74)}px`,
      }
    : undefined;
  return (
    <>
      {!scene && (
        <FallbackBoard2D
          notes={state.notes}
          edges={state.edges}
          clock={state.clock}
          callbacks={bridge.current}
          onEdge={setEdge}
          hovered={hovered}
          disabled={activeModal}
          avoidZone={activeAvoidZone}
        />
      )}
      {showCornerBar && (
        <div
          className={`corner-bar ${indentRect ? "in-tray" : ""} ${isDarkTray ? "on-dark" : "on-light"}`}
          style={cornerBarStyle}
        >
          <div className="room-control">
            <button
              className="room-name"
              aria-expanded={roomMenu}
              onClick={() => {
                const next = !roomMenu;
                setRoomMenu(next);
                if (next) {
                  setOverlay(null);
                  setEdge(null);
                  onCloseAccount?.();
                }
              }}
            >
              {room.name}
              <span>⌄</span>
            </button>
          </div>
          <div className="corner-actions">
            {room.role !== "observer" && (
              <>
                <button
                  onClick={() => {
                    onCloseAccount?.();
                    setRoomMenu(false);
                    setOverlay(null);
                    setEdge(null);
                    navigateBoard("/note/new");
                  }}
                >
                  ＋ 便签
                </button>
                <button
                  aria-pressed={overlay === "dice"}
                  onClick={() => {
                    onCloseAccount?.();
                    setRoomMenu(false);
                    setEdge(null);
                    setOverlay(overlay === "dice" ? null : "dice");
                  }}
                >
                  投骰
                </button>
                <button
                  aria-pressed={overlay === "surface"}
                  onClick={() => {
                    onCloseAccount?.();
                    setRoomMenu(false);
                    setEdge(null);
                    setOverlay(overlay === "surface" ? null : "surface");
                  }}
                >
                  台面
                </button>
              </>
            )}
            <button
              aria-pressed={accountOpen}
              onClick={() => {
                setRoomMenu(false);
                setOverlay(null);
                setEdge(null);
                onAccount();
              }}
              aria-label="账号设置"
            >
              账号
            </button>
          </div>
        </div>
      )}
      {roomMenuPresence.mounted && (
        <TrayOverlay
          menu="roomMenu"
          title="房间菜单"
          hideHeader
          exiting={roomMenuPresence.state === "exiting"}
          onClose={() => setRoomMenu(false)}
          indentRect={indentRect}
        >
          <div className="tray-room-menu-list" role="menu">
            <button
              role="menuitem"
              onClick={() => {
                setRoomMenu(false);
                navigateBoard("/", { replace: true });
                onRooms();
              }}
            >
              切换房间
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setRoomMenu(false);
                setSurfaceTab("surface");
                setOverlay("surface");
              }}
            >
              台面纹理
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setRoomMenu(false);
                setSurfaceTab("lighting");
                setOverlay("surface");
              }}
            >
              光影氛围
            </button>
            <button
              role="menuitem"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(room.joinCode);
                  setCopied(true);
                } catch {
                  setError(`邀请码：${room.joinCode}`);
                }
              }}
            >
              {copied ? "邀请码已复制" : `邀请码 · ${room.joinCode}`}
            </button>
          </div>
        </TrayOverlay>
      )}
      {scene && (
        <div className="scene-accessibility">
          <button onClick={() => setOverlay("clock")}>战役时钟</button>
          <button onClick={() => navigateBoard("/archive")}>归档便签盒</button>
          {state.notes
            .filter((n) => !n.archivedAt)
            .map((n) => (
              <button key={n.id} onClick={() => inspect(n.id)}>
                {n.title}
              </button>
            ))}
        </div>
      )}
      <HoverDeck
        note={hoverNote}
        edges={
          state.edges.filter(
            (e) => e.fromNoteId === hovered || e.toNoteId === hovered,
          ).length
        }
        userId={session.user.id}
        role={room.role}
        hidden={
          activeModal ||
          Boolean(quickEdge) ||
          Boolean(result?.result) ||
          (hoverBlocked && !pinHint)
        }
        pinHint={pinHint}
        raised={diceDocked}
        indentRect={indentRect}
      />
      {quickEdgePresence.mounted && quickEdgeShown && (
        <div
          className={`edge-quick-bar ${quickEdgePresence.state === "exiting" ? "exiting" : ""}`}
          role="region"
          aria-label="挂上关系纸签"
          style={
            indentRect
              ? {
                  left: `${indentRect.left + Math.round(indentRect.width * 0.14)}px`,
                  width: `${Math.max(260, Math.round(indentRect.width * 0.72))}px`,
                  bottom: `${Math.max(18, window.innerHeight - (indentRect.top + indentRect.height) + 18)}px`,
                }
              : undefined
          }
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="edge-quick-presets">
            {RELATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`edge-quick-chip edge-preset-${preset.category}`}
                onClick={() =>
                  void applyQuickEdge(
                    preset.label,
                    preset.style,
                    preset.color,
                    preset.defaultDirection ?? "none",
                  )
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
          <form
            className="edge-quick-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quickText.trim()) {
                setQuickEdge(null);
                return;
              }
              void applyQuickEdge(
                quickText.trim(),
                quickEdgeShown.style,
                quickEdgeShown.color,
                quickDir,
              );
            }}
          >
            <input
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="自定义关系，回车挂签…"
              maxLength={40}
            />
            <button
              type="button"
              className="edge-quick-dir"
              title="切换关系指向"
              onClick={() =>
                setQuickDir((prev) =>
                  prev === "none"
                    ? "forward"
                    : prev === "forward"
                      ? "both"
                      : "none",
                )
              }
            >
              {quickDir === "forward" ? "→" : quickDir === "both" ? "↔" : "—"}
            </button>
            <button
              type="button"
              className="edge-quick-close"
              aria-label="仅保留纯连线"
              onClick={() => setQuickEdge(null)}
            >
              ×
            </button>
          </form>
        </div>
      )}
      {dockHintPresence.mounted && dockHintShown && (
        <div
          className={`dice-dock-hint ${dockHintPresence.state === "exiting" ? "exiting" : ""}`}
          style={dockHintStyle}
          role="status"
        >
          <strong>
            点击重投 · {dockHintShown.label ? `${dockHintShown.label} ` : ""}
            {dockHintShown.notation}
          </strong>
          <span>右键换公式</span>
        </div>
      )}
      {(error || state.error) && (
        <div role="alert" className="board-error">
          <span>{error || state.error}</span>
          <button
            aria-label="关闭提示"
            onClick={() => {
              setError("");
              store.clearError();
            }}
          >
            ×
          </button>
          <button onClick={() => void store.refresh()}>重试</button>
        </div>
      )}
      {(route.kind === "new" || (route.kind === "note" && currentNote)) && (
        <Inspector
          key={selectedId ?? "new"}
          note={currentNote}
          store={store}
          scene={scene}
          userId={session.user.id}
          role={room.role}
          onClose={close}
          onDelete={(id) => {
            close();
            if (scene?.burnNote) {
              setTimeout(() => {
                scene.burnNote(id, () => safe(store.remove(id)));
              }, 260);
            } else {
              safe(store.remove(id));
            }
          }}
          onRoll={(notation, label, id) => roll(notation, label, id)}
          edges={state.edges.filter(
            (e) => e.fromNoteId === selectedId || e.toNoteId === selectedId,
          )}
          onEdge={(e) => {
            navigateBoard("/");
            setEdge(e);
          }}
          indentRect={indentRect}
        />
      )}
      {route.kind === "note" && !currentNote && state.notes.length > 0 && (
        <PaperDialog
          title="便签不存在"
          onClose={() => navigateBoard("/")}
          page
          indentRect={indentRect}
        >
          <p className="empty-box">这张便签可能已被移除或归属其他房间。</p>
        </PaperDialog>
      )}
      {archivePresence.mounted && (
        <ArchiveDrawer
          notes={state.notes}
          store={store}
          scene={scene}
          userId={session.user.id}
          role={room.role}
          onClose={close}
          onInspect={inspect}
          indentRect={indentRect}
          exiting={archivePresence.state === "exiting"}
        />
      )}
      {surfacePresence.mounted && (
        <SurfaceThemeDrawer
          theme={surfaceTheme}
          lighting={lighting}
          initialTab={surfaceTab}
          onTabChange={setSurfaceTab}
          indentRect={indentRect}
          exiting={surfacePresence.state === "exiting"}
          onChange={(next) => {
            setSurfaceTheme(next);
            saveSurfaceTheme(room.campaignId, next);
          }}
          onChangeLighting={(next, immediate = false) => {
            lightingImmediateRef.current = immediate;
            setLighting(next);
            saveLighting(room.campaignId, next);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {clockPresence.mounted && (
        <ClockDialog
          store={store}
          role={room.role}
          onClose={close}
          indentRect={indentRect}
          exiting={clockPresence.state === "exiting"}
        />
      )}
      {edgePresence.mounted && edgeShown && (
        <EdgeDialog
          edge={edgeShown}
          store={store}
          role={room.role}
          onClose={close}
          indentRect={indentRect}
          exiting={edgePresence.state === "exiting"}
        />
      )}
      {dicePresence.mounted && (
        <TrayOverlay
          menu="dice"
          title="投掷骰子"
          onClose={close}
          indentRect={indentRect}
          exiting={dicePresence.state === "exiting"}
        >
          <div className="dice-preset-grid">
            {DICE_PRESETS.map((notation) => (
              <button
                key={notation}
                type="button"
                className="tray-chip"
                onClick={() => setFormula(notation)}
                aria-pressed={formula === notation}
              >
                {notation}
              </button>
            ))}
          </div>
          <form
            className="tray-overlay-form"
            onSubmit={(e) => {
              e.preventDefault();
              void roll(formula);
            }}
          >
            <label className="tray-form-field">
              <span>骰子公式</span>
              <input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="例如 1d20、1d12+2、1d100"
                required
                maxLength={160}
              />
            </label>
            <div className="tray-form-field">
              <span>材质</span>
              <div className="dice-material-pills">
                {DICE_MATERIALS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="tray-chip"
                    aria-pressed={material === item.id}
                    onClick={() => setMaterial(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p className="tray-inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="tray-overlay-footer">
              {diceDocked && (
                <button
                  type="button"
                  className="tray-ghost-btn"
                  onClick={() => {
                    scene?.dice?.clear(false);
                    setDiceDocked(false);
                    setHoveredDice(null);
                  }}
                >
                  清空桌面骰子
                </button>
              )}
              <button
                type="submit"
                className="tray-primary-btn"
                disabled={rolling}
              >
                {rolling ? "投掷中…" : "投掷"}
              </button>
            </div>
          </form>
        </TrayOverlay>
      )}
      {resultPresence.mounted && resultShown?.result && (
        <div
          className={`dice-result ${resultPresence.state === "exiting" ? "exiting" : ""}`}
          role="status"
          style={
            indentRect
              ? {
                  left: `${indentRect.left + Math.round(indentRect.width * 0.5)}px`,
                  bottom: `${Math.max(20, window.innerHeight - (indentRect.top + indentRect.height) + 22)}px`,
                }
              : undefined
          }
        >
          <span className="dice-result-readout">
            {resultShown.label && `${resultShown.label} · `}
            {resultShown.notation} = <strong>{resultShown.result.total}</strong>
          </span>
          <i className="dice-result-sep" aria-hidden="true" />
          {room.role !== "observer" && (
            <button
              type="button"
              disabled={savingRollNote}
              onClick={() => void saveRollAsPolaroid(resultShown)}
            >
              {savingRollNote ? "拍摄中…" : "贴成便签"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setResult(null);
              scene?.dice.tidyToCorner();
            }}
          >
            归拢
          </button>
        </div>
      )}
    </>
  );
}
