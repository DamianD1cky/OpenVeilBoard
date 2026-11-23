import { useState } from "react";
import { PaperDialog } from "./PaperDialog";
import type { NoteEdge } from "../domain/types";
import { errorText, type BoardStore } from "../domain/boardStore";
export function EdgeDialog({
  edge,
  store,
  role,
  onClose,
}: {
  edge: NoteEdge;
  store: BoardStore;
  role: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(edge),
    [error, setError] = useState("");
  return (
    <PaperDialog title="线索连线" onClose={onClose}>
      <label>
        纸签
        <input
          value={draft.label}
          maxLength={120}
          readOnly={role === "observer"}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
      </label>
      <label>
        线材
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
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {role !== "observer" && (
        <div className="dialog-footer">
          <button
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
            className="ink-button"
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
    </PaperDialog>
  );
}
