import { useMemo, useRef, useState } from "react";
import type { Note, NoteEdge } from "../domain/types";
import { visibleEdges, paperAspect } from "../domain/geometry.js";
import {
  computeAvoidanceOffsets,
  type NormalizedRect,
} from "../domain/avoidance";
import { useClockText } from "./useClockText";
import type { CampaignClockConfig } from "../features/campaign/domain/campaignClock";
import { darkPaper } from "../domain/paperColors.js";
export interface BoardCallbacks {
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPointerDown: () => void;
  onMove: (id: string, point: { x: number; y: number }) => void;
  onArchive: (id: string) => void;
  onRestore?: (id: string) => void;
  onOpenArchive: () => void;
  onCloseArchive?: () => void;
  onArchivePull?: (id: string | null) => void;
  onClock: () => void;
  onEdge?: (edge: NoteEdge) => void;
  onBlank: () => void;
  onLinkStart: (id: string) => void;
  onLinkEnd: (id: string | null) => void;
  onPinClick?: (id: string) => void;
  onPinHover?: (id: string | null) => void;
  canEdit: (note: Note) => boolean;
  canLink?: () => boolean;
  canRoll?: () => boolean;
  onDiceHover?: (
    info: { notation: string; label: string; count: number } | null,
  ) => void;
  onDiceReroll?: () => void;
  onDiceMenu?: () => void;
}
export function FallbackBoard2D({
  notes,
  edges,
  clock,
  callbacks,
  onEdge,
  hovered,
  disabled,
  avoidZone = null,
}: {
  notes: Note[];
  edges: NoteEdge[];
  clock: CampaignClockConfig;
  callbacks: BoardCallbacks;
  onEdge: (edge: NoteEdge) => void;
  hovered: string | null;
  disabled: boolean;
  avoidZone?: NormalizedRect | null;
}) {
  const table = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    time: number;
    moved: boolean;
    shift: boolean;
  } | null>(null);
  const paperSize = (note: Note) => {
    const base =
      innerWidth <= 700
        ? innerWidth * 0.3
        : Math.max(100, Math.min(190, innerWidth * 0.14));
    const width = note.cardStyle === "polaroid" ? base * 0.76 : base;
    return { width, height: width / paperAspect(note) };
  };
  const bounds = (note: Note) => {
    const size = paperSize(note),
      angle = (note.rotation * Math.PI) / 180;
    const width =
      table.current?.clientWidth ||
      innerWidth * (innerWidth <= 700 ? 0.94 : 0.92);
    const height =
      table.current?.clientHeight ||
      innerHeight * (innerWidth <= 700 ? 0.94 : 0.92);
    return {
      x: Math.max(
        0,
        0.5 -
          (Math.abs(Math.cos(angle)) * size.width +
            Math.abs(Math.sin(angle)) * size.height) /
            width /
            2 -
          10 / width,
      ),
      y: Math.max(
        0,
        0.5 -
          (Math.abs(Math.sin(angle)) * size.width +
            Math.abs(Math.cos(angle)) * size.height) /
            height /
            2 -
          10 / height,
      ),
    };
  };
  const avoidOffsets = useMemo(() => {
    if (!avoidZone) return new Map();
    const width =
      table.current?.clientWidth ||
      innerWidth * (innerWidth <= 700 ? 0.94 : 0.92);
    const height =
      table.current?.clientHeight ||
      innerHeight * (innerWidth <= 700 ? 0.94 : 0.92);
    const active = notes.filter((n) => !n.archivedAt);
    return computeAvoidanceOffsets(
      active.map((n) => {
        const size = paperSize(n);
        const angle = (n.rotation * Math.PI) / 180;
        const hw =
          (Math.abs(Math.cos(angle)) * size.width +
            Math.abs(Math.sin(angle)) * size.height) /
          width /
          2;
        const hh =
          (Math.abs(Math.sin(angle)) * size.width +
            Math.abs(Math.cos(angle)) * size.height) /
          height /
          2;
        return { id: n.id, x: n.x, y: n.y, halfW: hw, halfH: hh };
      }),
      avoidZone,
    );
  }, [notes, avoidZone]);
  const point = (note: Note) => {
    const p = moving?.id === note.id ? moving : note,
      b = bounds(note),
      off = moving?.id === note.id ? null : avoidOffsets.get(note.id);
    return {
      x: Math.max(-b.x, Math.min(b.x, p.x + (off?.dx ?? 0))),
      y: Math.max(-b.y, Math.min(b.y, p.y + (off?.dy ?? 0))),
      yaw: off?.yawDeg ?? 0,
    };
  };
  const pin = (note: Note) => {
    const p = point(note),
      size = paperSize(note),
      angle = (note.rotation * Math.PI) / 180;
    const width =
        table.current?.clientWidth ||
        innerWidth * (innerWidth <= 700 ? 0.94 : 0.92),
      height =
        table.current?.clientHeight ||
        innerHeight * (innerWidth <= 700 ? 0.94 : 0.92);
    const dy = -size.height / 2 + 12.5 + (note.cardStyle === "urgent" ? 3 : 0);
    return {
      x: (p.x + 0.5) * 1000 - ((dy * Math.sin(angle)) / width) * 1000,
      y: (p.y + 0.5) * 1000 + ((dy * Math.cos(angle)) / height) * 1000,
    };
  };
  const archiveAt = (x: number, y: number) => {
    const r = table.current
      ?.querySelector(".archive-well-2d")
      ?.getBoundingClientRect();
    return Boolean(
      r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
    );
  };
  const [overArchive, setOverArchive] = useState(false);
  const start = (e: React.PointerEvent, note: Note) => {
    if (disabled || e.button !== 0) return;
    e.stopPropagation();
    callbacks.onPointerDown();
    callbacks.onHover(null);
    drag.current = {
      id: note.id,
      startX: e.clientX,
      startY: e.clientY,
      x: point(note).x,
      y: point(note).y,
      time: performance.now(),
      moved: false,
      shift: e.shiftKey,
    };
    if (e.shiftKey && (callbacks.canLink?.() ?? true))
      callbacks.onLinkStart(note.id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || disabled) return;
    d.moved ||= Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= 6;
    const note = notes.find((n) => n.id === d.id);
    if (!d.moved || !note || !callbacks.canEdit(note) || d.shift) return;
    const rect = table.current!.getBoundingClientRect();
    const b = bounds(note);
    setOverArchive(archiveAt(e.clientX, e.clientY));
    setMoving({
      id: d.id,
      x: Math.max(
        -b.x,
        Math.min(b.x, d.x + (e.clientX - d.startX) / rect.width),
      ),
      y: Math.max(
        -b.y,
        Math.min(b.y, d.y + (e.clientY - d.startY) / rect.height),
      ),
    });
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.shift && d.moved) {
      const target = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find(
          (el) =>
            el instanceof HTMLElement &&
            el.dataset.noteId &&
            el.dataset.noteId !== d.id,
        ) as HTMLElement | undefined;
      callbacks.onLinkEnd(target?.dataset.noteId ?? null);
    } else if (d.moved && moving) {
      if (archiveAt(e.clientX, e.clientY)) callbacks.onArchive(d.id);
      else callbacks.onMove(d.id, { x: moving.x, y: moving.y });
    } else if (!d.moved) callbacks.onSelect(d.id);
    setMoving(null);
    setOverArchive(false);
  };
  return (
    <div
      className={`fallback-board ${disabled ? "inactive" : ""}`}
      ref={table}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          callbacks.onPointerDown();
          callbacks.onBlank();
        }
      }}
    >
      <SurfaceClock clock={clock} onClick={callbacks.onClock} />
      <div className="print-slot-2d" />
      <svg
        className="fallback-edges"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
      >
        {visibleEdges(notes, edges).map((edge: NoteEdge) => {
          const a = notes.find((n) => n.id === edge.fromNoteId)!,
            b = notes.find((n) => n.id === edge.toNoteId)!;
          const p = pin(a),
            q = pin(b),
            x1 = p.x,
            y1 = p.y,
            x2 = q.x,
            y2 = q.y;
          const opacity =
            !hovered || [edge.fromNoteId, edge.toNoteId].includes(hovered)
              ? 1
              : 0.25;
          return (
            <g key={edge.id} opacity={opacity}>
              <path
                d={`M${x1},${y1} Q${(x1 + x2) / 2 + 16},${(y1 + y2) / 2 + 34} ${x2},${y2}`}
                stroke={edge.color}
                strokeWidth="2.2"
                fill="none"
                onClick={() => onEdge(edge)}
              />
              {edge.label && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 + 15}
                  textAnchor="middle"
                  onClick={() => onEdge(edge)}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {notes
        .filter((n) => !n.archivedAt)
        .map((note) => {
          const p = point(note);
          const clockCap = note.capabilities.find(
            (c) => c.enabled && c.type === "event_clock",
          );
          return (
            <article
              tabIndex={disabled ? -1 : 0}
              role="button"
              aria-label={`便签：${note.title}`}
              data-note-id={note.id}
              key={note.id}
              className={`fallback-card ${note.cardStyle} ${note.color} ${darkPaper(note.color) && note.cardStyle !== "polaroid" ? "dark-paper" : ""} ${moving?.id === note.id ? "dragging" : ""}`}
              style={{
                left: `${(p.x + 0.5) * 100}%`,
                top: `${(p.y + 0.5) * 100}%`,
                transform: `translate(-50%, -50%) rotate(${note.rotation + p.yaw}deg)`,
                zIndex: note.layer,
                backgroundColor: /^#[\da-f]{6}$/i.test(note.color)
                  ? note.color
                  : undefined,
              }}
              onPointerDown={(e) => start(e, note)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={() => {
                drag.current = null;
                setMoving(null);
                callbacks.onLinkEnd(null);
              }}
              onPointerEnter={() => {
                if (!drag.current && !disabled) callbacks.onHover(note.id);
              }}
              onPointerLeave={() => {
                if (!drag.current) callbacks.onHover(null);
              }}
              onKeyDown={(e) => {
                if (!disabled && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  callbacks.onSelect(note.id);
                }
              }}
            >
              <button
                type="button"
                className={`physical-pin ${note.pinColor}`}
                aria-label={`点击图钉连线：${note.title}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled && (callbacks.canLink?.() ?? true)) {
                    callbacks.onPinClick?.(note.id);
                  }
                }}
              />
              {note.cardStyle === "dossier" && (
                <small className="dossier-stamp">
                  档案 / {note.id.slice(-6).toUpperCase()}
                </small>
              )}
              {note.imageUrl && (
                <img src={note.imageUrl} alt="" draggable={false} />
              )}
              <h3>{note.title}</h3>
              <p>{note.body.replace(/[#*`>]/g, "")}</p>
              {clockCap && (
                <div className="paper-badges">
                  <span>
                    ◴ {clockCap.data.name || "事件钟"} {clockCap.data.value ?? 0}/{clockCap.data.segments ?? 6}
                  </span>
                </div>
              )}
            </article>
          );
        })}
      <button
        className={`archive-well-2d ${overArchive ? "near" : ""}`}
        onClick={callbacks.onOpenArchive}
      >
        {notes.some((n) => n.archivedAt) && (
          <i className="archived-paper-stack" />
        )}
        <span>
          便签盒 ·{" "}
          {String(notes.filter((n) => n.archivedAt).length).padStart(2, "0")}
        </span>
      </button>
    </div>
  );
}
function SurfaceClock({
  clock,
  onClick,
}: {
  clock: CampaignClockConfig;
  onClick: () => void;
}) {
  return (
    <button className="surface-clock-2d" onClick={onClick}>
      {useClockText(clock)}
    </button>
  );
}
