import { useState } from "react";
import type { IndentRect } from "./PaperDialog";
import { TrayOverlay } from "./TrayOverlay";
import type { NoteEdge } from "../domain/types";
import { errorText, type BoardStore } from "../domain/boardStore";
import {
  EDGE_STYLE_COLORS,
  RELATION_PRESETS,
  formatEdgeLabel,
  parseEdgeLabel,
  type EdgeDirection,
} from "../domain/edgeRelations";

const DIRECTION_OPTIONS: Array<{ id: EdgeDirection; label: string }> = [
  { id: "none", label: "无方向" },
  { id: "forward", label: "单向 →" },
  { id: "both", label: "双向 ↔" },
];

export function EdgeDialog({
  edge,
  store,
  role,
  onClose,
  indentRect = null,
  exiting = false,
}: {
  edge: NoteEdge;
  store: BoardStore;
  role: string;
  onClose: () => void;
  indentRect?: IndentRect | null;
  exiting?: boolean;
}) {
  const parsed = parseEdgeLabel(edge.label);
  const [text, setText] = useState(parsed.text);
  const [direction, setDirection] = useState<EdgeDirection>(parsed.direction);
  const [style, setStyle] = useState<NoteEdge["style"]>(edge.style);
  const [color, setColor] = useState(edge.color);
  const [error, setError] = useState("");
  const readonly = role === "observer";

  return (
    <TrayOverlay
      menu="edge"
      title="关系纸签"
      onClose={onClose}
      exiting={exiting}
      indentRect={indentRect}
    >
      {!readonly && (
        <div className="tray-form-field">
          <span>快捷关系</span>
          <div className="edge-preset-chips">
            {RELATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`tray-chip edge-preset-${preset.category}`}
                aria-pressed={text === preset.label}
                onClick={() => {
                  setText(preset.label);
                  setStyle(preset.style);
                  setColor(preset.color);
                  setDirection(preset.defaultDirection ?? "none");
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="tray-form-field">
        <span>纸签文字</span>
        <input
          value={text}
          maxLength={100}
          placeholder="输入关系或线索说明（如仇人、情人、债务）…"
          readOnly={readonly}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="tray-form-field">
        <span>指向</span>
        <div className="edge-dir-pills">
          {DIRECTION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="tray-chip"
              disabled={readonly}
              aria-pressed={direction === opt.id}
              onClick={() => setDirection(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <label className="tray-form-field">
        <span>线材</span>
        <select
          value={style}
          disabled={readonly}
          onChange={(e) => {
            const nextStyle = e.target.value as NoteEdge["style"];
            setStyle(nextStyle);
            setColor(EDGE_STYLE_COLORS[nextStyle]);
          }}
        >
          <option value="rope">红线</option>
          <option value="gold">金线</option>
          <option value="twine">麻绳</option>
          <option value="muted">暗灰线</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="tray-inline-error">
          {error}
        </p>
      )}
      {!readonly && (
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
                await store.updateEdge({
                  ...edge,
                  label: formatEdgeLabel(text, direction),
                  style,
                  color,
                });
                onClose();
              } catch (cause) {
                setError(errorText(cause));
              }
            }}
          >
            挂上纸签
          </button>
        </div>
      )}
    </TrayOverlay>
  );
}
