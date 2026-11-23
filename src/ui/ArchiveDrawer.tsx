import { useState } from "react";
import { PaperDialog, type IndentRect } from "./PaperDialog";
import type { Note } from "../domain/types";
import { errorText, type BoardStore } from "../domain/boardStore";
import { capabilityRegistry } from "../domain/capabilityRegistry";
export function ArchiveDrawer({
  store,
  notes,
  onClose,
  onInspect,
  userId,
  role,
  indentRect = null,
}: {
  store: BoardStore;
  notes: Note[];
  onClose: () => void;
  onInspect: (id: string) => void;
  userId: string;
  role: string;
  indentRect?: IndentRect | null;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [deleting, setDeleting] = useState<string | null>(null),
    [error, setError] = useState("");
  const totalArchived = notes.filter((n) => n.archivedAt).length;
  const archived = notes.filter(
    (n) =>
      n.archivedAt &&
      `${n.title} ${n.body} ${n.capabilities
        .filter((c) => c.type === "tags")
        .flatMap((c) => c.data.tags ?? [])
        .join(" ")}`.includes(query) &&
      (!filter || n.capabilities.some((c) => c.enabled && c.type === filter)),
  );
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  return (
    <PaperDialog
      title={`归档便签盒 · ${String(totalArchived).padStart(2, "0")}`}
      onClose={onClose}
      wide
      page
      indentRect={indentRect}
    >
      <div className="about-archive">
        <header className="about-archive-hero">
          <h1 className="about-display-static">
            ARCHIVE <span>{String(totalArchived).padStart(2, "0")}</span>
          </h1>
          <p className="about-summary-static">
            所有收进右下角便签盒的线索都保存在这里，随时点击查看或放回台面。
          </p>
          <div className="about-archive-controls">
            <input
              aria-label="搜索归档便签"
              placeholder="搜索归档便签…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="按能力筛选"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">全部能力</option>
              {capabilityRegistry.all().map((p) => (
                <option key={p.type} value={p.type}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="archive-grid">
          {archived.map((note) => {
            const badges = note.capabilities
              .filter((c) => c.enabled)
              .slice(0, 3)
              .map((c) =>
                capabilityRegistry.get(c.type)?.getHoverSummary(c.data),
              )
              .filter(Boolean);
            return (
              <article
                key={note.id}
                className={`archive-card ${note.cardStyle} ${note.color}`}
              >
                {note.imageUrl && (
                  <img
                    src={note.imageUrl}
                    alt=""
                    className="archive-card-img"
                  />
                )}
                <button
                  className="archive-note-title"
                  onClick={() => onInspect(note.id)}
                >
                  {note.title}
                </button>
                <p>{note.body.slice(0, 120) || "（无正文内容）"}</p>
                {badges.length > 0 && (
                  <div className="archive-card-badges">
                    {badges.map((b, idx) => (
                      <span key={idx}>
                        {b!.label} {b!.value}
                      </span>
                    ))}
                  </div>
                )}
                {(note.authorId === userId || role === "gm") && (
                  <div className="archive-card-actions">
                    <button
                      onClick={() =>
                        void act(() =>
                          store.patch(note.id, { archivedAt: null }),
                        )
                      }
                    >
                      放回台面
                    </button>
                    {deleting === note.id ? (
                      <button
                        className="danger"
                        onClick={() => void act(() => store.remove(note.id))}
                      >
                        确认删除
                      </button>
                    ) : (
                      <button onClick={() => setDeleting(note.id)}>
                        彻底删除
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!archived.length && (
            <p className="about-summary-static">便签盒里还没有归档的线索。</p>
          )}
        </div>
        {error && (
          <p role="alert" className="about-error">
            {error}
          </p>
        )}
      </div>
    </PaperDialog>
  );
}
