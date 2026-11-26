import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Note } from "../domain/types";
import { canReadNote } from "../domain/capabilityRegistry";
import type { IndentRect } from "./PaperDialog";

export interface TrayClockItem {
  key: string;
  noteId: string;
  capId: string;
  noteTitle: string;
  name: string;
  segments: number;
  value: number;
  consequence: string;
  primary: boolean;
  canEdit: boolean;
}

export function extractTrayClocks(
  notes: Note[],
  userId: string,
  role: string,
): TrayClockItem[] {
  const items: TrayClockItem[] = [];
  for (const note of notes) {
    if (note.archivedAt) continue;
    if (!canReadNote(note, userId, role)) continue;
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
        canEdit:
          role !== "observer" && (role === "gm" || note.authorId === userId),
      });
    }
  }
  return items;
}

function tensionLevel(value: number, segments: number) {
  if (value >= segments) return "triggered";
  if (segments - value === 1) return "critical";
  if (value / segments >= 0.5) return "tense";
  return "calm";
}

function LinearGauge({
  segments,
  value,
  compact = false,
}: {
  segments: number;
  value: number;
  compact?: boolean;
}) {
  return (
    <span
      className={`tray-linear-gauge ${compact ? "compact" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={i < value ? "filled" : ""} />
      ))}
    </span>
  );
}

export function TrayEventClockStage({
  notes,
  userId,
  role,
  scene = null,
  indentRect = null,
  hidden = false,
  onStepClock,
  onPromotePrimary,
  onOpenNote,
}: {
  notes: Note[];
  userId: string;
  role: string;
  scene?: any;
  indentRect?: IndentRect | null;
  hidden?: boolean;
  onStepClock: (noteId: string, capId: string, delta: number) => void;
  onPromotePrimary: (noteId: string, capId: string) => void;
  onOpenNote: (noteId: string) => void;
}) {
  const [localPrimaryKey, setLocalPrimaryKey] = useState<string | null>(null);
  const [hideBackdrop, setHideBackdrop] = useState(false);

  const clocks = useMemo(
    () => extractTrayClocks(notes, userId, role),
    [notes, userId, role],
  );

  const syncedPrimary = useMemo(() => {
    if (!clocks.length) return null;
    return (
      clocks.find((c) => c.primary) ??
      [...clocks].sort((a, b) => b.value / b.segments - a.value / a.segments)[0]
    );
  }, [clocks]);

  const primary = useMemo(() => {
    if (!clocks.length) return null;
    return (
      (localPrimaryKey && clocks.find((c) => c.key === localPrimaryKey)) ||
      syncedPrimary
    );
  }, [clocks, localPrimaryKey, syncedPrimary]);

  // Sync the giant full-tray 3D floor monument whenever primary clock or visibility changes
  useEffect(() => {
    if (!scene?.setEventClock) return;
    if (hidden || hideBackdrop || !primary) {
      scene.setEventClock(null);
      return;
    }
    scene.setEventClock(primary);
  }, [scene, hidden, hideBackdrop, primary]);

  useEffect(() => {
    return () => {
      scene?.setEventClock?.(null);
    };
  }, [scene]);

  if (hidden || !primary || !syncedPrimary) return null;

  const secondary = clocks.filter((c) => c.key !== primary.key);
  const tension = tensionLevel(primary.value, primary.segments);
  const stageStyle: CSSProperties | undefined = indentRect
    ? {
        left: `${indentRect.left + 28}px`,
        top: `${indentRect.top + 56}px`,
        width: `${Math.max(240, indentRect.width - 56)}px`,
      }
    : undefined;

  const handleSelectSecondary = (item: TrayClockItem) => {
    if (role === "gm") {
      setLocalPrimaryKey(null);
      onPromotePrimary(item.noteId, item.capId);
    } else {
      setLocalPrimaryKey(item.key);
    }
  };

  return (
    <section
      className={`tray-event-clock-stage tension-${tension}`}
      style={stageStyle}
      aria-label="台面事件钟控制条"
    >
      <div className="tray-event-clock-bar">
        <button
          type="button"
          className="tray-clock-title-btn"
          onClick={() => onOpenNote(primary.noteId)}
          title="点击查看对应便签"
        >
          {primary.name}
        </button>

        <button
          type="button"
          className="tray-clock-gauge-btn"
          disabled={!primary.canEdit}
          title={
            primary.canEdit
              ? "左键推进一格，右键回退一格"
              : `${primary.name} ${primary.value}/${primary.segments}`
          }
          aria-label={
            primary.canEdit
              ? `推进 ${primary.name}（当前 ${primary.value}/${primary.segments}）`
              : `${primary.name} ${primary.value}/${primary.segments}`
          }
          onClick={() => {
            if (!primary.canEdit) return;
            if (primary.value < primary.segments) {
              onStepClock(primary.noteId, primary.capId, 1);
            }
          }}
          onContextMenu={(e) => {
            if (!primary.canEdit) return;
            e.preventDefault();
            if (primary.value > 0) {
              onStepClock(primary.noteId, primary.capId, -1);
            }
          }}
        >
          <LinearGauge segments={primary.segments} value={primary.value} />
        </button>

        <span className="tray-clock-fraction">
          {primary.value}
          <small>/{primary.segments}</small>
        </span>

        {primary.canEdit && (
          <span className="tray-clock-step-pair">
            <button
              type="button"
              className="tray-clock-step"
              aria-label={`回退 ${primary.name}`}
              disabled={primary.value <= 0}
              onClick={() => onStepClock(primary.noteId, primary.capId, -1)}
            >
              −
            </button>
            <button
              type="button"
              className="tray-clock-step"
              aria-label={`推进 ${primary.name}`}
              disabled={primary.value >= primary.segments}
              onClick={() => onStepClock(primary.noteId, primary.capId, 1)}
            >
              ＋
            </button>
          </span>
        )}

        {tension === "triggered" && (
          <span className="tray-clock-badge">已触发</span>
        )}
        {tension === "critical" && (
          <span className="tray-clock-badge">仅余一格</span>
        )}

        <button
          type="button"
          className="tray-clock-collapse-btn"
          onClick={() => setHideBackdrop((v) => !v)}
          aria-pressed={!hideBackdrop}
        >
          {hideBackdrop ? "显示底纹" : "隐藏底纹"}
        </button>
      </div>

      {secondary.length > 0 && (
        <div
          className="tray-clock-secondary-strip"
          role="list"
          aria-label="次要事件钟"
        >
          {secondary.map((item) => {
            const subTension = tensionLevel(item.value, item.segments);
            return (
              <button
                key={item.key}
                type="button"
                role="listitem"
                className={`tray-clock-secondary-chip tension-${subTension}`}
                title={
                  role === "gm"
                    ? `点击将「${item.name}」设为全场主危机钟`
                    : `点击切换查看「${item.name}」`
                }
                onClick={() => handleSelectSecondary(item)}
              >
                <span className="tray-clock-sec-name">{item.name}</span>
                <LinearGauge
                  segments={item.segments}
                  value={item.value}
                  compact
                />
                <span className="tray-clock-sec-val">
                  {item.value}/{item.segments}
                </span>
              </button>
            );
          })}
          {localPrimaryKey && localPrimaryKey !== syncedPrimary.key && (
            <button
              type="button"
              className="tray-clock-reset-btn"
              onClick={() => setLocalPrimaryKey(null)}
            >
              回到主焦点
            </button>
          )}
        </div>
      )}
    </section>
  );
}
