import { useEffect, useState, type CSSProperties } from "react";
import { capabilityRegistry, canReadNote } from "../domain/capabilityRegistry";
import type { Note } from "../domain/types";
import type { IndentRect } from "./PaperDialog";

export function HoverDeck({
  note,
  edges,
  userId,
  role,
  hidden,
  pinHint = null,
  indentRect = null,
}: {
  note: Note | null;
  edges: number;
  userId: string;
  role: string;
  hidden: boolean;
  pinHint?: string | null;
  raised?: boolean;
  indentRect?: IndentRect | null;
}) {
  const [shown, setShown] = useState<Note | null>(null);
  useEffect(() => {
    if (hidden || pinHint) {
      setShown(null);
      return;
    }
    const timer = setTimeout(() => setShown(note), note ? 80 : 110);
    return () => clearTimeout(timer);
  }, [note, hidden, pinHint]);

  const sealed = shown && !canReadNote(shown, userId, role);
  const style: CSSProperties | undefined = indentRect
    ? {
        left: `${indentRect.left + Math.round(indentRect.width * 0.22)}px`,
        width: `${Math.max(200, Math.round(indentRect.width * 0.56))}px`,
        bottom: `${Math.max(20, window.innerHeight - (indentRect.top + indentRect.height) + 20)}px`,
      }
    : undefined;

  const capSummaries = shown && !sealed
    ? shown.capabilities
        .filter((c) => c.enabled)
        .slice(0, 2)
        .map((c) => capabilityRegistry.get(c.type)?.getHoverSummary(c.data))
        .filter(Boolean)
        .map((s) => `${s!.label} ${s!.value}`)
    : [];

  const isVisible = !hidden && Boolean(pinHint || shown);
  return (
    <aside
      className={`hover-caption ${hidden ? "hidden" : ""} ${isVisible ? "visible" : ""}`}
      style={style}
      aria-hidden="true"
    >
      {pinHint ? (
        <div className="hover-caption-line">
          <i className="paper-dot pin-hint-dot" />
          <strong>{pinHint}</strong>
        </div>
      ) : (
        shown && (
          <div className="hover-caption-line">
            <i className={`paper-dot ${shown.color}`} />
            <strong>{sealed ? "机密封条" : shown.title}</strong>
            {sealed ? (
              <span>仅授权成员可见</span>
            ) : (
              <>
                {edges > 0 && <span>{edges} 条连线</span>}
                {capSummaries.map((text, idx) => (
                  <span key={idx}>{text}</span>
                ))}
                <span className="hover-caption-author">{shown.authorName}</span>
              </>
            )}
          </div>
        )
      )}
    </aside>
  );
}
