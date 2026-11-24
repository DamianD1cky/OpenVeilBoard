import { useEffect, useMemo, useRef, useState } from "react";
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
import type {
  BurnMode,
  BurnTopology,
  CardStyle,
  Note,
  NoteBurnConfig,
  NoteEdge,
  NoteMediaItem,
  PinColor,
} from "../domain/types";
import { paperOptions } from "../domain/paperColors.js";
import { renderNotePreviewDataUrl } from "../features/polaroids/noteTexture.js";

const STYLE_LABELS: Record<CardStyle, string> = {
  note: "纸笺",
  polaroid: "拍立得",
  dossier: "案卷索引",
  urgent: "紧急封条",
};

const BURN_LABELS: Record<BurnMode, string> = {
  none: "完好纸面",
  scorched: "焦边残卷",
  burning: "余烬燃烧",
};

const TOPO_LABELS: Record<BurnTopology, string> = {
  corner: "一角烧缺",
  bottom: "底部烧残",
  perimeter: "四周焦边",
  point: "烟孔灼穿",
};

function initialMedia(note: Note | null): NoteMediaItem[] {
  if (!note) return [];
  if (Array.isArray(note.media) && note.media.length > 0) {
    return note.media.map((m, i) => ({
      id: m.id || `media-${i}`,
      path: m.path,
      url: m.url ?? (m.path === note.imagePath ? note.imageUrl : null),
      caption: m.caption ?? "",
      aspect: m.aspect,
    }));
  }
  if (note.imagePath || note.imageUrl) {
    return [
      {
        id: "cover",
        path: note.imagePath ?? note.imageUrl ?? "",
        url: note.imageUrl ?? note.imagePath ?? null,
        caption: "",
      },
    ];
  }
  return [];
}

export function Inspector({
  note,
  store,
  scene = null,
  userId,
  role,
  onClose,
  onDelete,
  onRoll,
  edges = [],
  onEdge,
  indentRect = null,
}: {
  note: Note | null;
  store: BoardStore;
  scene?: any;
  userId: string;
  role: string;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onRoll: (notation: string, label: string, noteId?: string) => Promise<void>;
  edges?: NoteEdge[];
  onEdge?: (edge: NoteEdge) => void;
  indentRect?: IndentRect | null;
}) {
  const [draft, setDraft] = useState(() =>
    note
      ? { ...note, media: initialMedia(note), burn: note.burn ?? null }
      : {
          title: "",
          body: "",
          color: "yellow",
          pinColor: "red" as PinColor,
          cardStyle: "note" as CardStyle,
          imagePath: null as string | null,
          imageUrl: null as string | null,
          media: [] as NoteMediaItem[],
          burn: null as NoteBurnConfig | null,
          capabilities: [] as Note["capabilities"],
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [cardThumb, setCardThumb] = useState<string>("");

  const baseline = useRef<Record<string, any>>(
    note ? { ...note, media: initialMedia(note), burn: note.burn ?? null } : {},
  );
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!note) return;
    const incomingMedia = initialMedia(note);
    const incoming = {
      ...note,
      media: incomingMedia,
      burn: note.burn ?? null,
    };
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
        "media",
        "burn",
        "capabilities",
      ] as const) {
        if (
          JSON.stringify((previous as any)[key]) ===
          JSON.stringify(baseline.current[key])
        ) {
          (next as any)[key] = (incoming as any)[key];
          baseline.current[key] = (incoming as any)[key];
        }
      }
      return next;
    });
  }, [note]);

  const readonly =
    role === "observer" ||
    Boolean(note && note.authorId !== userId && role !== "gm");
  const sealed = Boolean(note && !canReadNote(note, userId, role));

  const mediaItems = useMemo(
    () => (draft.media ?? []).filter((m) => Boolean(m.url || m.path)),
    [draft.media],
  );
  const safeSlideIndex = Math.max(
    0,
    Math.min(Math.max(0, mediaItems.length - 1), activeSlide),
  );
  const activeMedia = mediaItems[safeSlideIndex] ?? null;

  // Sync WebGPU recessed-tray optical projection whenever draft media changes
  useEffect(() => {
    if (!scene?.setNoteProjection) return;
    if (sealed) {
      scene.setNoteProjection({ active: false, items: [] });
      return;
    }
    scene.setNoteProjection({
      active: mediaItems.length > 0,
      items: mediaItems.map((m) => ({
        id: m.id,
        url: m.url || m.path,
        caption: m.caption,
        aspect: m.aspect,
      })),
      selectedIndex: safeSlideIndex,
    });
  }, [scene, sealed, mediaItems, safeSlideIndex]);

  useEffect(() => {
    return () => {
      scene?.closeProjectionLightbox?.(true);
      scene?.setNoteProjection?.({ active: false, items: [] });
    };
  }, [scene]);

  // Capture Escape when lightbox is open so it returns to floor projection first
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setLightboxOpen(false);
        scene?.closeProjectionLightbox?.();
      } else if (e.key === "ArrowLeft" && mediaItems.length > 1) {
        e.preventDefault();
        const prev = (safeSlideIndex - 1 + mediaItems.length) % mediaItems.length;
        setActiveSlide(prev);
        scene?.selectProjectionIndex?.(prev);
      } else if (e.key === "ArrowRight" && mediaItems.length > 1) {
        e.preventDefault();
        const next = (safeSlideIndex + 1) % mediaItems.length;
        setActiveSlide(next);
        scene?.selectProjectionIndex?.(next);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightboxOpen, mediaItems.length, safeSlideIndex, scene]);

  // Auto-size giant hero title textarea
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.title, indentRect?.width]);

  // Auto-size body textarea
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(84, Math.min(260, el.scrollHeight))}px`;
  }, [draft.body, preview]);

  // Live physical card thumbnail preview when tools drawer is expanded
  useEffect(() => {
    if (!showTools || sealed) return;
    let alive = true;
    const coverUrl = draft.imageUrl || mediaItems[0]?.url || null;
    const renderPreview = (img: HTMLImageElement | null) => {
      if (!alive) return;
      try {
        setCardThumb(renderNotePreviewDataUrl(draft, img));
      } catch {}
    };
    if (coverUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => renderPreview(img);
      img.onerror = () => renderPreview(null);
      img.src = coverUrl;
    } else {
      renderPreview(null);
    }
    return () => {
      alive = false;
    };
  }, [
    showTools,
    sealed,
    draft.title,
    draft.body,
    draft.cardStyle,
    draft.color,
    draft.imageUrl,
    draft.capabilities,
    mediaItems,
  ]);

  const notePatch = () => {
    const firstMedia = (draft.media ?? [])[0] ?? null;
    const all: Record<string, any> = {
      title: draft.title.trim(),
      body: draft.body,
      color: draft.color,
      pinColor: draft.pinColor,
      cardStyle: draft.cardStyle,
      imagePath: firstMedia?.path ?? draft.imagePath ?? null,
      media: draft.media ?? [],
      burn: draft.burn ?? null,
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

  async function uploadFiles(files: FileList | File[]) {
    if (readonly || !files.length) return;
    const list = [...files].filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type),
    );
    if (!list.length) {
      setError("请选择 JPG、PNG 或 WebP 格式的图片。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const added: NoteMediaItem[] = [];
      for (const file of list.slice(0, Math.max(1, 12 - mediaItems.length))) {
        const path = await store.repository.upload(file);
        const url = await store.repository.imageUrl(path);
        added.push({
          id: crypto.randomUUID(),
          path,
          url,
          caption: "",
        });
      }
      setDraft((prev) => {
        const nextMedia = [...(prev.media ?? []), ...added];
        return {
          ...prev,
          media: nextMedia,
          imagePath: nextMedia[0]?.path ?? null,
          imageUrl: nextMedia[0]?.url ?? null,
        };
      });
      if (added.length) {
        setActiveSlide(mediaItems.length);
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  function removeMediaItem(id: string) {
    setDraft((prev) => {
      const nextMedia = (prev.media ?? []).filter((m) => m.id !== id);
      return {
        ...prev,
        media: nextMedia,
        imagePath: nextMedia[0]?.path ?? null,
        imageUrl: nextMedia[0]?.url ?? null,
      };
    });
    setActiveSlide((idx) => Math.max(0, Math.min(idx, mediaItems.length - 2)));
  }

  function promoteMediaToCover(id: string) {
    setDraft((prev) => {
      const items = [...(prev.media ?? [])];
      const index = items.findIndex((m) => m.id === id);
      if (index <= 0) return prev;
      const [picked] = items.splice(index, 1);
      items.unshift(picked);
      return {
        ...prev,
        media: items,
        imagePath: items[0]?.path ?? null,
        imageUrl: items[0]?.url ?? null,
      };
    });
    setActiveSlide(0);
  }

  function setBurnMode(mode: BurnMode) {
    if (mode === "none") {
      setDraft({ ...draft, burn: null });
      return;
    }
    setDraft({
      ...draft,
      burn: {
        mode,
        topology: draft.burn?.topology ?? "corner",
        progress: draft.burn?.progress ?? 0.24,
        origin: draft.burn?.origin ?? [0.88, 0.14],
        glowIntensity: draft.burn?.glowIntensity ?? 2.2,
      },
    });
  }

  const pills = [
    ...(draft.burn && draft.burn.mode !== "none"
      ? [{ id: "burn", text: BURN_LABELS[draft.burn.mode] }]
      : []),
    ...draft.capabilities
      .filter((c) => c.enabled)
      .map((c) => {
        const summary = capabilityRegistry.get(c.type)?.getHoverSummary(c.data);
        return summary
          ? { id: c.id, text: `${summary.label} · ${summary.value}` }
          : null;
      })
      .filter(Boolean),
  ] as Array<{ id: string; text: string }>;

  const titleLen = draft.title.trim().length;
  const heroSizeClass =
    titleLen > 18 ? "hero-compact" : titleLen > 10 ? "hero-medium" : "hero-large";
  const hasProjection = mediaItems.length > 0;

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
        <fieldset
          className={`editor-fields note-stage ${hasProjection ? "has-media" : "no-media"}`}
          disabled={busy}
        >
          {/* Left-Top: Recessed-tray Optical Projection Stage */}
          <div
            className={`note-projection-zone ${dragOver ? "drag-over" : ""}`}
            onDragOver={(e) => {
              if (readonly) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!readonly && e.dataTransfer.files?.length) {
                void uploadFiles(e.dataTransfer.files);
              }
            }}
            onWheel={(e) => {
              if (mediaItems.length <= 1 || lightboxOpen) return;
              const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
              if (Math.abs(delta) < 18) return;
              const next =
                delta > 0
                  ? Math.min(mediaItems.length - 1, safeSlideIndex + 1)
                  : Math.max(0, safeSlideIndex - 1);
              if (next !== safeSlideIndex) {
                setActiveSlide(next);
                scene?.selectProjectionIndex?.(next);
              }
            }}
          >
            {hasProjection ? (
              <>
                {/* Clickable optical viewport over the WebGPU floor slide */}
                <button
                  type="button"
                  className="note-projection-hit"
                  aria-label="全屏预览线索照片"
                  onClick={() => {
                    setLightboxOpen(true);
                    scene?.openProjectionLightbox?.(safeSlideIndex);
                  }}
                >
                  {!scene && activeMedia && (
                    <img
                      className="note-projection-fallback"
                      src={activeMedia.url || activeMedia.path}
                      alt={activeMedia.caption || draft.title || "线索照片"}
                    />
                  )}
                  <span className="note-projection-zoom-hint">点击全屏预览 ↗</span>
                </button>

                <div className="note-projection-bar">
                  <div className="note-slide-dots">
                    {mediaItems.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`note-slide-pill ${idx === safeSlideIndex ? "active" : ""}`}
                        onClick={() => {
                          setActiveSlide(idx);
                          scene?.selectProjectionIndex?.(idx);
                        }}
                      >
                        {String(idx + 1).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                  <div className="note-projection-actions">
                    <button
                      type="button"
                      className="note-proj-btn"
                      onClick={() => {
                        setLightboxOpen(true);
                        scene?.openProjectionLightbox?.(safeSlideIndex);
                      }}
                    >
                      预览大图
                    </button>
                    {!readonly && activeMedia && safeSlideIndex > 0 && (
                      <button
                        type="button"
                        className="note-proj-btn"
                        onClick={() => promoteMediaToCover(activeMedia.id)}
                      >
                        设为封面
                      </button>
                    )}
                    {!readonly && (
                      <label className="note-proj-btn">
                        ＋ 添图
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          hidden
                          onChange={(e) => {
                            if (e.target.files?.length) void uploadFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    {!readonly && activeMedia && (
                      <button
                        type="button"
                        className="note-proj-btn note-proj-btn-danger"
                        onClick={() => removeMediaItem(activeMedia.id)}
                      >
                        移图
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : !readonly ? (
              <label className="note-projection-dropzone">
                <span className="note-drop-corner tl" />
                <span className="note-drop-corner tr" />
                <span className="note-drop-corner bl" />
                <span className="note-drop-corner br" />
                <strong>投射线索影像到台面</strong>
                <small>拖入或点击上传 JPG / PNG / WebP（支持多图幻灯）</small>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>

          {/* Right Column: Body Editor/Preview, Meta Pills & Controls (respects ArchiveWell below) */}
          <div className="note-meta-col">
            <div className="note-meta-body-wrap">
              {preview ? (
                <div
                  className="note-body-preview"
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
                  className="note-body-input"
                  aria-label="便签正文"
                  placeholder="写下线索，支持 Markdown"
                  maxLength={1000}
                  rows={4}
                  value={draft.body}
                  readOnly={readonly}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              )}
            </div>

            <div className="note-pills-row">
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

            <nav className="note-links-row" aria-label="便签操作">
              <button
                type="button"
                className="about-link"
                aria-pressed={preview}
                onClick={() => setPreview((v) => !v)}
              >
                {preview ? "编辑正文" : "排版预览"}
              </button>
              <button
                type="button"
                className="about-link"
                aria-expanded={showTools}
                onClick={() => setShowTools((v) => !v)}
              >
                {showTools ? "收起属性" : "属性 · 燃烧 · 能力"}
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
              {note && !readonly && onDelete && (
                confirmBurn ? (
                  <button
                    type="button"
                    className="about-link note-link-danger"
                    onClick={() => onDelete(note.id)}
                  >
                    确认焚毁
                  </button>
                ) : (
                  <button
                    type="button"
                    className="about-link"
                    onClick={() => setConfirmBurn(true)}
                  >
                    焚毁
                  </button>
                )
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
                    const m = initialMedia(latest);
                    baseline.current = { ...latest, media: m, burn: latest.burn ?? null };
                    setDraft({ ...latest, media: m, burn: latest.burn ?? null });
                    setError("");
                  }
                }}
              >
                载入最新版本
              </button>
            )}
          </div>

          {/* Left-Bottom: Giant Editorial Hero Typography (Branch/Veilboard Polaroid Signature) */}
          <div className="note-hero-zone">
            <textarea
              ref={titleRef}
              className={`note-hero-title ${heroSizeClass}`}
              aria-label="便签标题"
              rows={1}
              maxLength={80}
              placeholder="写下标题"
              value={draft.title}
              readOnly={readonly}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              onChange={(e) =>
                setDraft({ ...draft, title: e.target.value.replace(/\n/g, "") })
              }
            />
          </div>

          {/* Expandable Tools / Burn / Card Preview / Capabilities Glass Drawer */}
          {showTools && (
            <div className="about-drawer note-tools-drawer">
              <div className="note-drawer-top">
                {cardThumb && (
                  <figure className="note-card-thumb">
                    <img src={cardThumb} alt="桌面纸卡预览" />
                    <figcaption>
                      {STYLE_LABELS[draft.cardStyle]}
                      {draft.burn && draft.burn.mode !== "none"
                        ? ` · ${BURN_LABELS[draft.burn.mode]}`
                        : ""}
                    </figcaption>
                  </figure>
                )}

                <div className="note-drawer-controls">
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
                  </div>

                  {/* Burnt Note Shader Controls */}
                  <div className="note-burn-controls">
                    <label>
                      <span>燃烧质感</span>
                      <select
                        value={draft.burn?.mode ?? "none"}
                        disabled={readonly}
                        onChange={(e) => setBurnMode(e.target.value as BurnMode)}
                      >
                        <option value="none">完好纸面</option>
                        <option value="scorched">焦边残卷（静态）</option>
                        <option value="burning">余烬燃烧（动态火星）</option>
                      </select>
                    </label>
                    {draft.burn && draft.burn.mode !== "none" && (
                      <>
                        <label>
                          <span>烧灼方位</span>
                          <select
                            value={draft.burn.topology}
                            disabled={readonly}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                burn: {
                                  ...draft.burn!,
                                  topology: e.target.value as BurnTopology,
                                },
                              })
                            }
                          >
                            {(Object.keys(TOPO_LABELS) as BurnTopology[]).map(
                              (topo) => (
                                <option key={topo} value={topo}>
                                  {TOPO_LABELS[topo]}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="note-burn-slider">
                          <span>
                            烧灼程度 {Math.round(draft.burn.progress * 100)}%
                          </span>
                          <input
                            type="range"
                            min={0.08}
                            max={0.55}
                            step={0.02}
                            disabled={readonly}
                            value={draft.burn.progress}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                burn: {
                                  ...draft.burn!,
                                  progress: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
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

      {/* Fullscreen Optical Lightbox Chrome (paired with WebGPU NDC slide lift, or 2D img fallback) */}
      {lightboxOpen && activeMedia && (
        <div
          className={`note-lightbox-overlay ${scene ? "gpu-driven" : "dom-driven"}`}
          role="dialog"
          aria-modal="true"
          aria-label="影像全屏预览"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setLightboxOpen(false);
              scene?.closeProjectionLightbox?.();
            }
          }}
        >
          <button
            type="button"
            className="note-lightbox-close"
            aria-label="退出全屏预览"
            onClick={() => {
              setLightboxOpen(false);
              scene?.closeProjectionLightbox?.();
            }}
          >
            X
          </button>
          {!scene && (
            <img
              className="note-lightbox-img"
              src={activeMedia.url || activeMedia.path}
              alt={activeMedia.caption || draft.title || "影像预览"}
            />
          )}
          {mediaItems.length > 1 && (
            <div className="note-lightbox-nav">
              <button
                type="button"
                aria-label="上一张"
                onClick={() => {
                  const prev =
                    (safeSlideIndex - 1 + mediaItems.length) % mediaItems.length;
                  setActiveSlide(prev);
                  scene?.selectProjectionIndex?.(prev);
                }}
              >
                ←
              </button>
              <span>
                {String(safeSlideIndex + 1).padStart(2, "0")} /{" "}
                {String(mediaItems.length).padStart(2, "0")}
              </span>
              <button
                type="button"
                aria-label="下一张"
                onClick={() => {
                  const next = (safeSlideIndex + 1) % mediaItems.length;
                  setActiveSlide(next);
                  scene?.selectProjectionIndex?.(next);
                }}
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </PaperDialog>
  );
}
