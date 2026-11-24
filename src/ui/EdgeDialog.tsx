import { useState } from "react";
import type { IndentRect } from "./PaperDialog";
import { TrayOverlay } from "./TrayOverlay";
import type { NoteEdge } from "../domain/types";
import { errorText, type BoardStore } from "../domain/boardStore";

export function EdgeDialog({
  edge,
  store,
  role,
  onClose,
  indentRect = null,
}: {
  edge: NoteEdge;
  store: BoardStore;
  role: string;
  onClose: () => void;
  indentRect?: IndentRect | null;
}) {
  const [draft, setDraft] = useState(edge),
    [error, setError] = useState("");
  return (
    <TrayOverlay
      menu="edge"
      title="线索连线"
      onClose={onClose}
      indentRect={indentRect}
    >
      <label className="tray-form-field">
        <span>纸签</span>
        <input
          value={draft.label}
          maxLength={120}
          placeholder="输入线索关系说明…"
          readOnly={role === "observer"}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
      </label>
      <label className="tray-form-field">
        <span>线材</span>
        <select
          value={draft.style}
          disabled={role === "observer"}
          onChange={(e) => {
            const style = e.target.value as NoteEdge["style"];
            setDraft({
              ...draft,
              style,
              color: {
                rope: "#b83227",
                twine: "#96866d",
                gold: "#bc984d",
                muted: "#55534b",
              }[style],
            });
          }}
        >
          <option value="rope">红线</option>
          <option value="twine">麻绳</option>
          <option value="gold">金线</option>
          <option value="muted">暗灰线</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="tray-inline-error">
          {error}
        </p>
      )}
      {role !== "observer" && (
        <div className="tray-overlay-footer">
          <button
            type="button"
            className="tray-ghost-btn danger"
            onClick={async () => {
              try {
                await store.removeEdge(edge.id);
                onClose();
              } catch (cause) {
                setError(errorText(cause));
              }
            }}
          >
            删除连线
          </button>
          <button
            type="button"
            className="tray-primary-btn"
            onClick={async () => {
              try {
                await store.updateEdge(draft);
                onClose();
              } catch (cause) {
                setError(errorText(cause));
              }
            }}
          >
            保存
          </button>
        </div>
      )}
    </TrayOverlay>
  );
}
