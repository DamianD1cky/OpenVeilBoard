import { useState } from "react";
import type { CapabilityPanelProps } from "./types";
export function CommentsPanel({
  data,
  readonly,
  userId,
  onChange,
  onComment,
  canAct,
}: CapabilityPanelProps) {
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const allowed = canAct !== false && (Boolean(onComment) || !readonly);
  async function submit(body: string, deleteId?: string) {
    setBusy(true);
    setError("");
    try {
      if (onComment) await onComment(body, deleteId);
      else
        onChange({
          ...data,
          entries: deleteId
            ? data.entries.filter((v: any) => v.id !== deleteId)
            : [
                ...(data.entries ?? []),
                {
                  id: crypto.randomUUID(),
                  authorId: userId,
                  authorName: "我",
                  createdAt: new Date().toISOString(),
                  body,
                },
              ],
        });
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "批注未保存。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="comments-panel">
      {(data.entries ?? []).map((entry: any) => (
        <div className="comment" key={entry.id}>
          <div>
            <small>
              {entry.authorName ?? "成员"} ·{" "}
              {new Date(entry.createdAt).toLocaleString("zh-CN")}
            </small>
            {allowed && entry.authorId === userId && (
              <button
                type="button"
                disabled={busy}
                aria-label="删除本人批注"
                onClick={() => void submit("", entry.id)}
              >
                ×
              </button>
            )}
          </div>
          <p>{entry.body}</p>
        </div>
      ))}
      {allowed && (
        <div className="inline-add">
          <input
            aria-label="新批注"
            placeholder="写一条批注"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (text.trim()) void submit(text.trim());
            }}
          >
            批注
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
