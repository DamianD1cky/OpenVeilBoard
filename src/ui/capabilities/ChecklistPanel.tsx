import { useState } from "react";
import type { CapabilityPanelProps } from "./types";
export function ChecklistPanel({
  data,
  readonly,
  onChange,
}: CapabilityPanelProps) {
  const [draft, setDraft] = useState("");
  const items = data.items ?? [];
  const update = (next: any[]) => onChange({ ...data, items: next });
  return (
    <div className="checklist">
      {items.map((item: any, i: number) => (
        <div
          key={item.id}
          className="check-row"
          draggable={!readonly}
          onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (readonly) return;
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (!Number.isInteger(from) || from < 0 || from >= items.length)
              return;
            const next = [...items];
            next.splice(i, 0, next.splice(from, 1)[0]);
            update(next);
          }}
        >
          <input
            type="checkbox"
            aria-label={item.text}
            checked={Boolean(item.done)}
            disabled={readonly}
            onChange={() =>
              update(
                items.map((v: any) =>
                  v.id === item.id ? { ...v, done: !v.done } : v,
                ),
              )
            }
          />
          <input
            className={item.done ? "done" : ""}
            aria-label="清单项"
            value={item.text}
            readOnly={readonly}
            onChange={(e) =>
              update(
                items.map((v: any) =>
                  v.id === item.id ? { ...v, text: e.target.value } : v,
                ),
              )
            }
          />
          {!readonly && (
            <button
              type="button"
              aria-label={`删除${item.text}`}
              onClick={() => update(items.filter((v: any) => v.id !== item.id))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readonly && (
        <div className="inline-add">
          <input
            aria-label="新清单项"
            placeholder="添加一项"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (draft.trim()) {
                  update([
                    ...items,
                    {
                      id: crypto.randomUUID(),
                      text: draft.trim(),
                      done: false,
                    },
                  ]);
                  setDraft("");
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (draft.trim()) {
                update([
                  ...items,
                  { id: crypto.randomUUID(), text: draft.trim(), done: false },
                ]);
                setDraft("");
              }
            }}
          >
            添加
          </button>
        </div>
      )}
    </div>
  );
}
