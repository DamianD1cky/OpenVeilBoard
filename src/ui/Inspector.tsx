import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { PaperDialog, type IndentRect } from "./PaperDialog";
import { plugins } from "./capabilities/registry";
import {
  capabilityRegistry,
  createCapability,
  canReadNote,
} from "../domain/capabilityRegistry";
import { errorText, type BoardStore } from "../domain/boardStore";
import type { Note, NoteEdge, CardStyle, PinColor } from "../domain/types";
import { paperOptions } from "../domain/paperColors.js";

const STYLE_LABELS: Record<CardStyle, string> = {
  note: "纸笺",
  polaroid: "拍立得",
  dossier: "案卷索引",
  urgent: "紧急封条",
};

export function Inspector({
  note,
  store,
  userId,
  role,
  onClose,
  onRoll,
  edges = [],
  onEdge,
  indentRect = null,
}: {
  note: Note | null;
  store: BoardStore;
  userId: string;
  role: string;
  onClose: () => void;
  onRoll: (notation: string, label: string, noteId?: string) => Promise<void>;
  edges?: NoteEdge[];
  onEdge?: (edge: NoteEdge) => void;
  indentRect?: IndentRect | null;
}) {
  const [draft, setDraft] = useState(
    note ?? {
      title: "",
      body: "",
      color: "yellow",
      pinColor: "red" as PinColor,
      cardStyle: "note" as CardStyle,
      imagePath: null as string | null,
      imageUrl: null as string | null,
      capabilities: [] as Note["capabilities"],
    },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [showTools, setShowTools] = useState(false);
  const baseline = useRef<Record<string, any>>(note ?? {});
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!note) return;
    setDraft((previous) => {
      const next = { ...previous };
      for (const key of [
        "title",
        "body",
        "color",
        "pinColor",
        "cardStyle",
        "imagePath",
        "imageUrl",
        "capabilities",
      ] as const) {
        if (
          JSON.stringify(previous[key]) ===
          JSON.stringify(baseline.current[key])
        ) {
          (next as any)[key] = note[key];
          baseline.current[key] = note[key];
        }
      }
      return next;
    });
  }, [note]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(88, el.scrollHeight)}px`;
  }, [draft.body, preview]);

  const readonly =
    role === "observer" ||
    Boolean(note && note.authorId !== userId && role !== "gm");
  const sealed = note && !canReadNote(note, userId, role);

  const notePatch = () => {
    const all = {
      title: draft.title.trim(),
      body: draft.body,
      color: draft.color,
      pinColor: draft.pinColor,
      cardStyle: draft.cardStyle,
      imagePath: draft.imagePath,
      capabilities: draft.capabilities,
    };
    return note
      ? Object.fromEntries(
          Object.entries(all).filter(
            ([key, value]) =>
              JSON.stringify(value) !== JSON.stringify(baseline.current[key]),
          ),
        )
      : all;
  };

  async function save() {
    setBusy(true);
    setError("");
    try {
      const patch = notePatch();
      if (!draft.title.trim()) throw new Error("请写一个标题。");
      if (note) await store.patch(note.id, patch, baseline.current);
      else await store.create(patch);
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  const pills = draft.capabilities
    .filter((c) => c.enabled)
    .map((c) => {
      const summary = capabilityRegistry.get(c.type)?.getHoverSummary(c.data);
      return summary
        ? { id: c.id, text: `${summary.label} · ${summary.value}` }
        : null;
    })
    .filter(Boolean) as Array<{ id: string; text: string }>;

  return (
    <PaperDialog
      title={note ? (sealed ? "机密封条" : note.title || "检视便签") : "新建便签"}
      onClose={onClose}
      wide
      page
      backLabel={note?.archivedAt ? "← 返回便签盒" : "← 返回台面"}
      indentRect={indentRect}
    >
      {sealed ? (
        <div className="about-stage">
          <h1 className="about-display-static">机密封条</h1>
          <p className="about-summary-static">这张便签仅对授权成员开放。</p>
        </div>
      ) : (
        <fieldset className="editor-fields about-stage" disabled={busy}>
          {draft.imageUrl && (
            <img
              className="about-cover"
              src={draft.imageUrl}
              alt="便签封面"
            />
          )}

          <input
            className="about-title-input"
            aria-label="便签标题"
            autoComplete="off"
            maxLength={80}
            placeholder="写下标题"
            value={draft.title}
            readOnly={readonly}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />

          {preview ? (
            <div
              className="about-body-preview"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  marked.parse(draft.body || "（无正文内容）", {
                    async: false,
                  }) as string,
                ),
              }}
            />
          ) : (
            <textarea
              ref={bodyRef}
              className="about-body-input"
              aria-label="便签正文"
              placeholder="写下线索，支持 Markdown"
              maxLength={1000}
              rows={3}
              value={draft.body}
              readOnly={readonly}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          )}

          <div className="about-pills">
            <button
              type="button"
              className="about-pill"
              onClick={() => setShowTools((v) => !v)}
            >
              {STYLE_LABELS[draft.cardStyle]}
            </button>
            {pills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                className="about-pill"
                onClick={() => setShowTools(true)}
              >
                {pill.text}
              </button>
            ))}
            {edges.map((edge) => (
              <button
                key={edge.id}
                type="button"
                className="about-pill"
                onClick={() => onEdge?.(edge)}
              >
                {edge.label || "编辑连线"}
              </button>
            ))}
          </div>

          <nav className="about-links" aria-label="便签操作">
            <button
              type="button"
              className="about-link"
              aria-pressed={preview}
              onClick={() => setPreview((v) => !v)}
            >
              {preview ? "编辑正文" : "预览"}
            </button>
            <button
              type="button"
              className="about-link"
              aria-expanded={showTools}
              onClick={() => setShowTools((v) => !v)}
            >
              {showTools ? "收起属性" : "属性与能力"}
            </button>
            {note && !readonly && (
              <button
                type="button"
                className="about-link"
                onClick={async () => {
                  try {
                    await store.patch(note.id, {
                      archivedAt: note.archivedAt
                        ? null
                        : new Date().toISOString(),
                    });
                    onClose();
                  } catch (cause) {
                    setError(errorText(cause));
                  }
                }}
              >
                {note.archivedAt ? "放回台面" : "归档"}
              </button>
            )}
            {!readonly && (
              <button
                type="button"
                className="about-link about-link-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? "保存中…" : "保存便签"}
              </button>
            )}
          </nav>

          {error && (
            <p role="alert" className="about-error">
              {error}
            </p>
          )}
          {error.includes("已被其他成员修改") && note && (
            <button
              type="button"
              className="about-link"
              onClick={() => {
                const latest = store
                  .getSnapshot()
                  .notes.find((n) => n.id === note.id);
                if (latest) {
                  baseline.current = latest;
                  setDraft(latest);
                  setError("");
                }
              }}
            >
              载入最新版本
            </button>
          )}

          {showTools && (
            <div className="about-drawer">
              <div className="about-meta-row">
                <label>
                  <span>纸张</span>
                  <select
                    value={draft.cardStyle}
                    disabled={readonly}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        cardStyle: e.target.value as CardStyle,
                      })
                    }
                  >
                    <option value="note">纸笺</option>
                    <option value="polaroid">拍立得</option>
                    <option value="dossier">案卷索引</option>
                    <option value="urgent">紧急封条</option>
                  </select>
                </label>
                <label>
                  <span>纸色</span>
                  <select
                    value={draft.color}
                    disabled={readonly}
                    onChange={(e) =>
                      setDraft({ ...draft, color: e.target.value })
                    }
                  >
                    {!paperOptions.some(([value]) => value === draft.color) && (
                      <option value={draft.color}>原纸色</option>
                    )}
                    {paperOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>图钉</span>
                  <select
                    value={draft.pinColor}
                    disabled={readonly}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        pinColor: e.target.value as PinColor,
                      })
                    }
                  >
                    <option value="red">红</option>
                    <option value="blue">蓝</option>
                    <option value="green">绿</option>
                    <option value="yellow">铜</option>
                    <option value="black">黑</option>
                  </select>
                </label>
                {!readonly && (
                  <div className="about-cover-actions">
                    <label className="about-pill-btn">
                      上传封面
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setBusy(true);
                          try {
                            const path = await store.repository.upload(file);
                            setDraft({
                              ...draft,
                              imagePath: path,
                              imageUrl: await store.repository.imageUrl(path),
                            });
                          } catch (cause) {
                            setError(errorText(cause));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </label>
                    {draft.imagePath && (
                      <button
                        type="button"
                        className="about-pill-btn"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            imagePath: null,
                            imageUrl: null,
                          })
                        }
                      >
                        移除封面
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="about-capabilities">
                {draft.capabilities.map((cap) => {
                  const plugin = plugins.find((p) => p.type === cap.type);
                  if (!plugin) return null;
                  const Panel = plugin.InspectorPanel;
                  const locked =
                    readonly || (cap.type === "secret" && role !== "gm");
                  return (
                    <section className="about-cap-section" key={cap.id}>
                      <div className="about-cap-heading">
                        <h3>{plugin.label}</h3>
                        {!locked && (
                          <div className="about-cap-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  capabilities: draft.capabilities.map((c) =>
                                    c.id === cap.id
                                      ? { ...c, enabled: !c.enabled }
                                      : c,
                                  ),
                                })
                              }
                            >
                              {cap.enabled ? "停用" : "启用"}
                            </button>
                            <button
                              type="button"
                              aria-label={`卸载${plugin.label}`}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  capabilities: draft.capabilities.filter(
                                    (c) => c.id !== cap.id,
                                  ),
                                })
                              }
                            >
                              X
                            </button>
                          </div>
                        )}
                      </div>
                      {cap.enabled && (
                        <Panel
                          data={cap.data}
                          readonly={locked}
                          userId={userId}
                          isGM={role === "gm"}
                          canAct={
                            role !== "observer" &&
                            (cap.type !== "comments" ||
                              Boolean(
                                note?.capabilities.some((c) => c.id === cap.id),
                              ))
                          }
                          members={store.getSnapshot().members}
                          onComment={
                            note &&
                            note.capabilities.some((c) => c.id === cap.id)
                              ? async (body, deleteId) => {
                                  const saved = await store.comment(
                                    note.id,
                                    cap.id,
                                    body,
                                    deleteId,
                                  );
                                  baseline.current.capabilities =
                                    baseline.current.capabilities.map(
                                      (c: any) =>
                                        c.id === cap.id
                                          ? (saved.capabilities.find(
                                              (v) => v.id === cap.id,
                                            ) ?? c)
                                          : c,
                                    );
                                  setDraft((previous) => ({
                                    ...previous,
                                    capabilities: previous.capabilities.map(
                                      (c) =>
                                        c.id === cap.id
                                          ? (saved.capabilities.find(
                                              (v) => v.id === cap.id,
                                            ) ?? c)
                                          : c,
                                    ),
                                  }));
                                }
                              : undefined
                          }
                          onChange={(data) =>
                            setDraft({
                              ...draft,
                              capabilities: draft.capabilities.map((c) =>
                                c.id === cap.id ? { ...c, data } : c,
                              ),
                            })
                          }
                          onTriggerAction={async (action) => {
                            if (busy) return;
                            setBusy(true);
                            try {
                              let id = note?.id;
                              if (!readonly) {
                                if (!draft.title.trim())
                                  throw new Error("请先写一个标题。");
                                if (id)
                                  await store.patch(
                                    id,
                                    notePatch(),
                                    baseline.current,
                                  );
                                else
                                  id = (await store.create(notePatch())).id;
                              }
                              await onRoll(action.notation, action.label, id);
                            } catch (cause) {
                              setError(errorText(cause));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      )}
                    </section>
                  );
                })}
              </div>

              {!readonly && (
                <label className="about-add-cap">
                  <span>添加能力</span>
                  <select
                    aria-label="添加能力"
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        setDraft({
                          ...draft,
                          capabilities: [
                            ...draft.capabilities,
                            createCapability(e.target.value as any),
                          ],
                        });
                    }}
                  >
                    <option value="">选择…</option>
                    {plugins
                      .filter(
                        (p) =>
                          !draft.capabilities.some((c) => c.type === p.type) &&
                          (p.type !== "secret" || role === "gm"),
                      )
                      .map((p) => (
                        <option key={p.type} value={p.type}>
                          {p.label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </fieldset>
      )}
    </PaperDialog>
  );
}
