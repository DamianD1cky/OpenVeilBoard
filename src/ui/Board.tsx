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
import { SurfaceThemeDrawer } from "./SurfaceThemeDrawer";
import {
  loadSavedSurfaceTheme,
  resolveSurfaceTheme,
  saveSurfaceTheme,
} from "../scene/surfacePresets.js";
import { boardPlacement } from "./boardPlacement";
import {
  getBoardRoute,
  navigateBoard,
  subscribeBoardRoute,
} from "../shared/navigation";
import type { NoteEdge, SurfaceTheme } from "../domain/types";
import type { DiceRoll } from "../features/dice/types";
export function Board({
  room,
  session,
  scene,
  demo,
  onRooms,
  onAccount,
}: {
  room: ActiveCampaignAccess;
  session: AppSession;
  scene: any;
  demo: boolean;
  onRooms: () => void;
  onAccount: () => void;
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
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceTheme>(() =>
    loadSavedSurfaceTheme(room.campaignId),
  );
  useEffect(() => {
    setSurfaceTheme(loadSavedSurfaceTheme(room.campaignId));
  }, [room.campaignId]);
  useEffect(() => {
    void scene?.setSurfaceTheme?.(surfaceTheme);
  }, [scene, surfaceTheme]);
  const [indentRect, setIndentRect] = useState<IndentRect | null>(null);
  const [edge, setEdge] = useState<NoteEdge | null>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [linking, setLinking] = useState(false),
    [linkStart, setLinkStart] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [formula, setFormula] = useState("1d20"),
    [material, setMaterial] = useState("ivory"),
    [result, setResult] = useState<DiceRoll | null>(null),
    [rolling, setRolling] = useState(false),
    [diceDocked, setDiceDocked] = useState(false);
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
    if (!roomMenu) return;
    const dismiss = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".room-control"))
        setRoomMenu(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRoomMenu(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [roomMenu]);
  const lastRoll = useRef<string | null>(null),
    sourceNote = useRef<string | undefined>(undefined),
    bridge = useRef<BoardCallbacks>(null!);
  const safe = (operation: Promise<unknown>) =>
    void operation.catch((cause) => setError(errorText(cause)));
  const close = () => {
    setOverlay(null);
    setEdge(null);
    if (route.kind !== "home") {
      const inspected =
        route.kind === "note"
          ? state.notes.find((n) => n.id === route.noteId)
          : null;
      navigateBoard(inspected?.archivedAt ? "/archive" : "/");
    }
  };
  const inspect = (id: string) => {
    setOverlay(null);
    setEdge(null);
    setHovered(null);
    navigateBoard(`/note/${encodeURIComponent(id)}`);
  };
  async function roll(notation: string, label = "", noteId?: string) {
    sourceNote.current = noteId;
    setRolling(true);
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
      setError(errorText(cause));
    } finally {
      setRolling(false);
    }
  }
  const connect = (id: string | null) => {
    if (id && linkStart && id !== linkStart) safe(store.edge(linkStart, id));
    setLinkStart(null);
    setLinking(false);
  };
  bridge.current = {
    canEdit: (note) =>
      room.role !== "observer" &&
      (note.authorId === session.user.id || room.role === "gm"),
    canLink: () => room.role !== "observer",
    onSelect: (id) => {
      if (linking) {
        if (linkStart) connect(id);
        else setLinkStart(id);
      } else inspect(id);
    },
    onHover: (id) => {
      setHovered(id);
      if (id) setHoverBlocked(false);
    },
    onPointerDown: () => {
      setHoverBlocked(true);
      setHovered(null);
      setResult(null);
    },
    onMove: (id, point) => safe(store.patch(id, point)),
    onArchive: (id) =>
      safe(store.patch(id, { archivedAt: new Date().toISOString() })),
    onOpenArchive: () => {
      setOverlay(null);
      setEdge(null);
      setHovered(null);
      navigateBoard("/archive");
    },
    onClock: () => setOverlay("clock"),
    onEdge: (nextEdge) => {
      setOverlay(null);
      setHovered(null);
      setEdge(nextEdge);
    },
    onBlank: () => {
      setLinking(false);
      setLinkStart(null);
      setResult(null);
      scene?.dice.tidyToCorner();
    },
    onLinkStart: (id) => {
      if (room.role !== "observer") {
        setLinking(true);
        setLinkStart(id);
      }
    },
    onLinkEnd: connect,
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
    scene.callbacks.onDiceState = (next: string) =>
      setDiceDocked(next === "docked");
    scene.enter(
      Boolean(localStorage.getItem(`veilboard:visited:${session.user.id}`)),
    );
    localStorage.setItem(`veilboard:visited:${session.user.id}`, "1");
    return () => {
      scene.setRouteView?.(false);
      scene.setUI(false);
      scene.sync({ notes: [], edges: [], clock: state.clock });
      scene.dice.clear(true);
    };
  }, [scene, room.campaignId]);
  useEffect(() => {
    scene?.sync(state);
  }, [scene, state.notes, state.edges, state.clock]);
  const activeModal = Boolean(route.kind !== "home" || overlay || edge);
  const overlayBlur = Boolean((overlay && overlay !== "surface") || edge);
  useEffect(() => {
    if (!scene?.onIndentRect) {
      setIndentRect(null);
      return;
    }
    return scene.onIndentRect((rect: IndentRect | null) => setIndentRect(rect));
  }, [scene]);
  useEffect(() => {
    scene?.setUI(true, activeModal, overlayBlur);
  }, [scene, activeModal, overlayBlur]);
  useEffect(() => {
    scene?.setRouteView?.(route.kind !== "home");
  }, [scene, route.kind]);
  useEffect(() => {
    if (linkStart) scene?.rope.highlight(linkStart);
    else scene?.rope.highlight(null);
  }, [scene, linkStart]);
  useEffect(() => {
    if (!state.roll?.result || state.roll.id === lastRoll.current) return;
    lastRoll.current = state.roll.id;
    if (scene) scene.dice.throw(state.roll, material);
    else setResult(state.roll);
  }, [state.roll, scene, material]);
  const hoverNote = state.notes.find((n) => n.id === hovered) ?? null;
  const selectedId = route.kind === "note" ? route.noteId : null;
  const currentNote = selectedId
    ? (state.notes.find((n) => n.id === selectedId) ?? null)
    : null;
  const isDarkTray = Boolean(resolveSurfaceTheme(surfaceTheme).tray.isDark);
  const showCornerBar = route.kind === "home";
  const cornerBarStyle = indentRect
    ? {
        left: `${indentRect.left + 28}px`,
        top: `${indentRect.top + 22}px`,
        width: `${Math.max(220, indentRect.width - 56)}px`,
        right: "auto",
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
            onClick={() => setRoomMenu(!roomMenu)}
          >
            {room.name}
            <span>⌄</span>
          </button>
          {roomMenu && (
            <div className="room-menu" role="menu">
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
                  setOverlay(overlay === "surface" ? null : "surface");
                }}
              >
                台面纹理
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
          )}
        </div>
        <div className="corner-actions">
          {room.role !== "observer" && (
            <>
              <button
                onClick={() => {
                  setOverlay(null);
                  setEdge(null);
                  navigateBoard("/note/new");
                }}
              >
                ＋ 便签
              </button>
              <button
                aria-pressed={linking}
                onClick={() => {
                  setLinking(!linking);
                  setLinkStart(null);
                }}
              >
                {linking ? "取消连线" : "连线"}
              </button>
              <button onClick={() => setOverlay("dice")}>投骰</button>
              <button
                aria-pressed={overlay === "surface"}
                onClick={() =>
                  setOverlay(overlay === "surface" ? null : "surface")
                }
              >
                台面
              </button>
            </>
          )}
          <button onClick={onAccount} aria-label="账号设置">
            账号
          </button>
        </div>
      </div>
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
        hidden={activeModal || hoverBlocked}
        raised={diceDocked}
      />
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
      {route.kind === "archive" && (
        <ArchiveDrawer
          notes={state.notes}
          store={store}
          userId={session.user.id}
          role={room.role}
          onClose={close}
          onInspect={inspect}
          indentRect={indentRect}
        />
      )}
      {overlay === "surface" && (
        <SurfaceThemeDrawer
          theme={surfaceTheme}
          indentRect={indentRect}
          onChange={(next) => {
            setSurfaceTheme(next);
            saveSurfaceTheme(room.campaignId, next);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "clock" && (
        <ClockDialog store={store} role={room.role} onClose={close} />
      )}
      {edge && (
        <EdgeDialog
          edge={edge}
          store={store}
          role={room.role}
          onClose={close}
        />
      )}
      {overlay === "dice" && (
        <PaperDialog title="投掷到台面" onClose={close}>
          <div className="dice-presets">
            {["1d20", "2d6", "1d100"].map((notation) => (
              <button
                key={notation}
                onClick={() => setFormula(notation)}
                aria-pressed={formula === notation}
              >
                {notation}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void roll(formula);
            }}
          >
            <label>
              骰子公式
              <input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                required
                maxLength={160}
              />
            </label>
            <label>
              材质
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              >
                <option value="ivory">象牙白</option>
                <option value="obsidian">黑曜石金字</option>
                <option value="brass">复古黄铜</option>
                <option value="jade">深绿翡翠</option>
              </select>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="ink-button auth-submit" disabled={rolling}>
              {rolling ? "投掷中…" : "投掷"}
            </button>
          </form>
        </PaperDialog>
      )}
      {result?.result && !activeModal && (
        <div className="dice-result" role="status">
          <span>
            {result.label && `${result.label} · `}
            {result.notation} = <strong>{result.result.total}</strong>
          </span>
          {room.role !== "observer" && (
            <button
              onClick={() => {
                const payload = {
                  title: result.label || "投骰记录",
                  body: result.result!.output,
                  cardStyle: "dossier" as const,
                  capabilities: [],
                };
                setResult(null);
                if (scene?.dice?.collectIntoSlot) {
                  scene.dice.collectIntoSlot(() => safe(store.create(payload)));
                } else {
                  safe(store.create(payload));
                }
              }}
            >
              贴成便签
            </button>
          )}
          <button
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
