import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { IndentRect } from "./PaperDialog";
import type { Note } from "../domain/types";
import { errorText, type BoardStore } from "../domain/boardStore";
import { capabilityRegistry } from "../domain/capabilityRegistry";
import { darkPaper } from "../domain/paperColors.js";

const PAGE_SIZE = 8;

export function ArchiveDrawer({
  store,
  notes,
  scene = null,
  onClose,
  onInspect,
  userId,
  role,
  indentRect = null,
}: {
  store: BoardStore;
  notes: Note[];
  scene?: any;
  onClose: () => void;
  onInspect: (id: string) => void;
  userId: string;
  role: string;
  indentRect?: IndentRect | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");

  const totalArchived = useMemo(
    () => notes.filter((n) => n.archivedAt).length,
    [notes],
  );

  const archived = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (!n.archivedAt) return false;
        if (filter && !n.capabilities.some((c) => c.enabled && c.type === filter))
          return false;
        if (!q) return true;
        const text = `${n.title} ${n.body} ${n.capabilities
          .filter((c) => c.type === "tags")
          .flatMap((c) => c.data.tags ?? [])
          .join(" ")}`.toLowerCase();
        return text.includes(q);
      })
      .sort(
        (a, b) =>
          new Date(b.archivedAt || 0).getTime() -
          new Date(a.archivedAt || 0).getTime(),
      );
  }, [notes, query, filter]);

  const pageCount = Math.max(1, Math.ceil(archived.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () => archived.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [archived, safePage],
  );
  const visibleIdsKey = pageItems.map((n) => n.id).join(",");

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // Sync visible archived note IDs directly to the 3D WebGPU tabletop grid
  useEffect(() => {
    if (!scene?.setArchiveView) return;
    scene.setArchiveView(
      true,
      pageItems.map((n) => n.id),
    );
  }, [scene, visibleIdsKey]);

  useEffect(() => {
    return () => {
      scene?.setArchiveView?.(false);
    };
  }, [scene]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const restore = async (id: string) => {
    try {
      await store.patch(id, { archivedAt: null });
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const barStyle: CSSProperties | undefined = indentRect
    ? {
        left: `${indentRect.left + 28}px`,
        top: `${indentRect.top + 22}px`,
        width: `${Math.max(220, indentRect.width - 56)}px`,
        right: "auto",
      }
    : undefined;

  const emptyStyle: CSSProperties | undefined = indentRect
    ? {
        left: `${indentRect.left}px`,
        top: `${indentRect.top + 96}px`,
        width: `${indentRect.width}px`,
        height: `${Math.max(160, indentRect.height - 160)}px`,
      }
    : undefined;

  return (
    <div
      className={`archive-tray-layer ${scene ? "mode-3d" : "mode-2d"}`}
      role="region"
      aria-label={`便签盒，共 ${totalArchived} 枚已归档便签`}
    >
      <header className="archive-tray-bar" style={barStyle}>
        <button
          type="button"
          className="archive-back-btn"
          onClick={onClose}
        >
          ← 返回台面
        </button>

        <div className="archive-bar-center">
          <span className="archive-bar-title">
            便签盒 · {String(totalArchived).padStart(2, "0")}
          </span>
          {totalArchived > 0 && (
            <div className="archive-bar-filters">
              <input
                aria-label="搜索归档便签"
                placeholder="搜索归档…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
              <select
                aria-label="按能力筛选"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">全部能力</option>
                {capabilityRegistry.all().map((p) => (
                  <option key={p.type} value={p.type}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="archive-bar-right">
          {pageCount > 1 && (
            <div className="archive-pager">
              <button
                type="button"
                disabled={safePage <= 0}
                aria-label="上一页"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ‹
              </button>
              <span>
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                aria-label="下一页"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                ›
              </button>
            </div>
          )}
          <button
            type="button"
            className="archive-close-btn"
            aria-label="关闭便签盒"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="archive-tray-error">
          {error}
        </p>
      )}

      {!archived.length && (
        <div className="archive-empty-whisper" style={emptyStyle}>
          <strong>
            {totalArchived === 0
              ? "便签盒里还没有归档的线索"
              : "没有匹配的归档便签"}
          </strong>
          <span>
            {totalArchived === 0
              ? "将台面上的便签拖入右下角便签盒，即可整洁收存"
              : "试试清空搜索词或切换能力筛选"}
          </span>
        </div>
      )}

      {/* 2D fallback: render real physical note cards neatly arranged on the tray */}
      {!scene && pageItems.length > 0 && (
        <div className="archive-table-grid-2d">
          {pageItems.map((note, idx) => {
            const canRestore =
              role !== "observer" && (note.authorId === userId || role === "gm");
            const enabled = note.capabilities.filter((c) => c.enabled);
            const shown = enabled.slice(0, enabled.length > 3 ? 2 : 3);
            const rot = (idx % 2 === 0 ? 1 : -1) * (0.6 + (idx % 3) * 0.35);
            return (
              <article
                key={note.id}
                role="button"
                tabIndex={0}
                className={`fallback-card archive-physical-card ${note.cardStyle} ${note.color} ${darkPaper(note.color) && note.cardStyle !== "polaroid" ? "dark-paper" : ""}`}
                style={{
                  transform: `rotate(${rot}deg)`,
                  backgroundColor: /^#[\da-f]{6}$/i.test(note.color)
                    ? note.color
                    : undefined,
                }}
                onClick={() => onInspect(note.id)}
                onContextMenu={(e) => {
                  if (!canRestore) return;
                  e.preventDefault();
                  void restore(note.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onInspect(note.id);
                  }
                }}
              >
                <span className={`physical-pin ${note.pinColor}`} />
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
                <div className="paper-badges">
                  {shown.map((c) => {
                    const plugin = capabilityRegistry.get(c.type);
                    return (
                      <span key={c.id}>
                        {plugin?.icon} {plugin?.getHoverSummary(c.data)?.value}
                      </span>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Screen-reader / keyboard access for 3D archive cards */}
      {scene && pageItems.length > 0 && (
        <div className="scene-accessibility">
          {pageItems.map((note) => (
            <button key={note.id} onClick={() => onInspect(note.id)}>
              {note.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
