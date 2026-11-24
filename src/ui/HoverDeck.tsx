import { useEffect, useState } from "react";
import { capabilityRegistry, canReadNote } from "../domain/capabilityRegistry";
import type { Note } from "../domain/types";
export function HoverDeck({
  note,
  edges,
  userId,
  role,
  hidden,
  raised = false,
}: {
  note: Note | null;
  edges: number;
  userId: string;
  role: string;
  hidden: boolean;
  raised?: boolean;
}) {
  const [shown, setShown] = useState<Note | null>(null);
  useEffect(() => {
    if (hidden) {
      setShown(null);
      return;
    }
    const timer = setTimeout(() => setShown(note), note ? 90 : 120);
    return () => clearTimeout(timer);
  }, [note, hidden]);
  const sealed = shown && !canReadNote(shown, userId, role);
  return (
    <aside
      className={`hover-deck ${raised ? "raised" : ""} ${hidden ? "hidden" : ""} ${shown && !hidden ? "visible" : ""}`}
      aria-hidden="true"
    >
      {shown && (
        <>
          <div className="hover-title">
            <i className={`paper-dot ${shown.color}`} />
            <strong>{shown.title}</strong>
            {edges > 0 && <span>{edges} 条连线</span>}
          </div>
          <p>{sealed ? "仅授权成员可见" : shown.body}</p>
          <div className="hover-capabilities">
            {shown.capabilities
              .filter((c) => c.enabled)
              .slice(0, 3)
              .map((c) => {
                const s = capabilityRegistry
                  .get(c.type)
                  ?.getHoverSummary(c.data);
                return s ? (
                  <span key={c.id}>
                    {s.label} {s.value}
                  </span>
                ) : null;
              })}
          </div>
          <small>
            {shown.authorName} ·{" "}
            {new Date(shown.updatedAt).toLocaleDateString("zh-CN")}
          </small>
        </>
      )}
    </aside>
  );
}
