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
import { TrayOverlay, TRAY_MENU_ZONES } from "./TrayOverlay";
import {
  applyTrayInkTokens,
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
}: {
  room: ActiveCampaignAccess;
  session: AppSession;
  scene: any;
  demo: boolean;
  accountOpen?: boolean;
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
  const lastRoll = useRef<string | null>(null),
    lastRollMeta = useRef<{ notation: string; label: string } | null>(null),
    rollFromCorner = useRef(false),
    sourceNote = useRef<string | undefined>(undefined),
    bridge = useRef<BoardCallbacks>(null!);
  const safe = (operation: Promise<unknown>) =>
    void operation.catch((cause) => setError(errorText(cause)));
  const close = () => {
    setOverlay(null);
    setEdge(null);
    setRoomMenu(false);
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
    if (id && linkStart && id !== linkStart) safe(store.edge(linkStart, id));
    setLinkStart(null);
    setLinking(false);
  };
  bridge.current = {
    canEdit: (note) =>
      room.role !== "observer" &&
      (note.authorId === session.user.id || room.role === "gm"),
    canLink: () => room.role !== "observer",
    canRoll: () => room.role !== "observer",
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
      setRoomMenu(false);
      setHovered(null);
      navigateBoard("/archive");
    },
    onClock: () => {
      setRoomMenu(false);
      setEdge(null);
      setOverlay("clock");
    },
    onEdge: (nextEdge) => {
      setRoomMenu(false);
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
      scene.setRouteView?.(false);
      scene.setUI(false);
      scene.sync({ notes: [], edges: [], clock: state.clock });
      scene.dice.clear(true);
    };
  }, [scene, room.campaignId]);
  useEffect(() => {
    scene?.sync(state);
  }, [scene, state.notes, state.edges, state.clock]);
  const activeModal = Boolean(
    route.kind !== "home" || overlay || edge || roomMenu || accountOpen,
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
    if (activeModal) setHoveredDice(null);
  }, [activeModal]);
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
    if (linkStart) scene?.rope.highlight(linkStart);
    else scene?.rope.highlight(null);
  }, [scene, linkStart]);
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
  const selectedId = route.kind === "note" ? route.noteId : null;
  const currentNote = selectedId
    ? (state.notes.find((n) => n.id === selectedId) ?? null)
    : null;
  const isDarkTray = Boolean(resolveSurfaceTheme(surfaceTheme).tray.isDark);
  useEffect(() => {
    applyTrayInkTokens(surfaceTheme);
  }, [surfaceTheme]);
  const showCornerBar = route.kind === "home";
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
                    setRoomMenu(false);
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
                    setRoomMenu(false);
                    setLinking(!linking);
                    setLinkStart(null);
                  }}
                >
                  {linking ? "取消连线" : "连线"}
                </button>
                <button
                  aria-pressed={overlay === "dice"}
                  onClick={() => {
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
      {roomMenu && showCornerBar && (
        <TrayOverlay
          menu="roomMenu"
          title="房间菜单"
          hideHeader
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
                setOverlay("surface");
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
        hidden={activeModal || hoverBlocked}
        raised={diceDocked}
      />
      {hoveredDice && !activeModal && diceDocked && (
        <div className="dice-dock-hint" style={dockHintStyle} role="status">
          <strong>
            点击重投 · {hoveredDice.label ? `${hoveredDice.label} ` : ""}
            {hoveredDice.notation}
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
        <ClockDialog
          store={store}
          role={room.role}
          onClose={close}
          indentRect={indentRect}
        />
      )}
      {edge && (
        <EdgeDialog
          edge={edge}
          store={store}
          role={room.role}
          onClose={close}
          indentRect={indentRect}
        />
      )}
      {overlay === "dice" && (
        <TrayOverlay
          menu="dice"
          title="投掷骰子"
          onClose={close}
          indentRect={indentRect}
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
      {result?.result && !activeModal && (
        <div className="dice-result" role="status">
          <span>
            {result.label && `${result.label} · `}
            {result.notation} = <strong>{result.result.total}</strong>
          </span>
          {room.role !== "observer" && (
            <button
              disabled={savingRollNote}
              onClick={() => void saveRollAsPolaroid(result)}
            >
              {savingRollNote ? "拍摄中…" : "贴成便签"}
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
