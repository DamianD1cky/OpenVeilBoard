import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import type { CapabilityType } from "../domain/types";
import {
  MAX_NOTE_BODY_LENGTH,
  markdownToTiptapHtml,
  tiptapJsonToMarkdown,
} from "./noteMarkdown";

interface SlashCommand {
  id: string;
  title: string;
  hint: string;
  badge: string;
  keywords: string;
  group: "block" | "capability";
  run: (editor: Editor) => void;
}

interface SlashState {
  open: boolean;
  query: string;
  from: number;
  to: number;
  x: number;
  y: number;
  index: number;
}

interface BubbleState {
  open: boolean;
  x: number;
  y: number;
}

export function NotionNoteEditor({
  value,
  readonly = false,
  role = "player",
  onChange,
  onSave,
  onAddCapability,
}: {
  value: string;
  readonly?: boolean;
  role?: string;
  onChange: (nextMarkdown: string) => void;
  onSave?: () => void;
  onAddCapability?: (type: CapabilityType) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onAddCapRef = useRef(onAddCapability);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onAddCapRef.current = onAddCapability;

  const [slash, setSlash] = useState<SlashState>({
    open: false,
    query: "",
    from: 0,
    to: 0,
    x: 0,
    y: 0,
    index: 0,
  });
  const [bubble, setBubble] = useState<BubbleState>({
    open: false,
    x: 0,
    y: 0,
  });

  const slashRef = useRef(slash);
  slashRef.current = slash;

  const commands = useMemo<SlashCommand[]>(() => {
    const base: SlashCommand[] = [
      {
        id: "h3",
        title: "小标题",
        hint: "### 线索小节",
        badge: "H3",
        keywords: "h3 heading title 标题 小标题",
        group: "block",
        run: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "h2",
        title: "大标题",
        hint: "## 章节抬头",
        badge: "H2",
        keywords: "h2 heading title 标题 大标题",
        group: "block",
        run: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "todo",
        title: "待办清单",
        hint: "可勾选的调查条目",
        badge: "☑",
        keywords: "todo task check 待办 清单 勾选",
        group: "block",
        run: (ed) => ed.chain().focus().toggleTaskList().run(),
      },
      {
        id: "bullet",
        title: "线索列表",
        hint: "无序要点条目",
        badge: "•",
        keywords: "bullet list ul 列表 线索",
        group: "block",
        run: (ed) => ed.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered",
        title: "编号列表",
        hint: "按时间或步骤排序",
        badge: "1.",
        keywords: "ordered number ol 编号 步骤",
        group: "block",
        run: (ed) => ed.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "quote",
        title: "线索摘录",
        hint: "人物证词或书信引用",
        badge: "”",
        keywords: "quote blockquote 引用 摘录 证词",
        group: "block",
        run: (ed) => ed.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "divider",
        title: "分隔线",
        hint: "划分不同段落",
        badge: "—",
        keywords: "hr divider line 分隔线 线",
        group: "block",
        run: (ed) => ed.chain().focus().setHorizontalRule().run(),
      },
    ];
    if (onAddCapability) {
      base.push(
        {
          id: "cap-clock",
          title: "挂载事件钟",
          hint: "添加进度/倒计时危机钟",
          badge: "◷",
          keywords: "clock 事件钟 倒计时 危机",
          group: "capability",
          run: () => onAddCapRef.current?.("event_clock"),
        },
        {
          id: "cap-dice",
          title: "挂载骰子检定",
          hint: "添加快捷投骰公式",
          badge: "⚄",
          keywords: "dice roll 骰子 检定",
          group: "capability",
          run: () => onAddCapRef.current?.("dice_action"),
        },
      );
      if (role === "gm") {
        base.push({
          id: "cap-secret",
          title: "挂载机密封条",
          hint: "仅 GM 与指定成员可见",
          badge: "封",
          keywords: "secret 机密 秘密 封条",
          group: "capability",
          run: () => onAddCapRef.current?.("secret"),
        });
      }
    }
    return base;
  }, [Boolean(onAddCapability), role]);

  const filteredCommands = useMemo(() => {
    const q = slash.query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.keywords.toLowerCase().includes(q) ||
        c.badge.toLowerCase().includes(q),
    );
  }, [commands, slash.query]);

  const filteredRef = useRef(filteredCommands);
  filteredRef.current = filteredCommands;

  const updateFloatingMenus = (ed: Editor) => {
    const wrap = wrapRef.current;
    if (!wrap || readonly) {
      setSlash((s) => (s.open ? { ...s, open: false } : s));
      setBubble((b) => (b.open ? { ...b, open: false } : b));
      return;
    }
    const { selection } = ed.state;
    const { from, to, empty } = selection;
    const wrapRect = wrap.getBoundingClientRect();

    // 1. Bubble Menu when text is selected
    if (!empty && to - from > 0) {
      setSlash((s) => (s.open ? { ...s, open: false } : s));
      try {
        const start = ed.view.coordsAtPos(from);
        const end = ed.view.coordsAtPos(to);
        const midX = (start.left + end.right) * 0.5 - wrapRect.left;
        const clampedX = Math.max(
          92,
          Math.min(wrapRect.width - 92, midX),
        );
        const y = Math.max(8, start.top - wrapRect.top - 40);
        setBubble({ open: true, x: clampedX, y });
      } catch {
        setBubble((b) => (b.open ? { ...b, open: false } : b));
      }
      return;
    }
    setBubble((b) => (b.open ? { ...b, open: false } : b));

    // 2. Slash Command detection on collapsed caret
    const $from = selection.$from;
    if ($from.parent.type.name === "codeBlock") {
      setSlash((s) => (s.open ? { ...s, open: false } : s));
      return;
    }
    const textBefore = $from.parent.textBetween(
      0,
      $from.parentOffset,
      undefined,
      "\ufffc",
    );
    const match = /(?:^|\s)\/([^\s/]{0,20})$/.exec(textBefore);
    if (!match) {
      setSlash((s) => (s.open ? { ...s, open: false } : s));
      return;
    }
    const query = match[1] ?? "";
    const slashOffset = match[0].startsWith("/")
      ? match[0].length
      : match[0].length - 1;
    const slashFrom = from - slashOffset;
    try {
      const coords = ed.view.coordsAtPos(from);
      const x = Math.max(
        6,
        Math.min(wrapRect.width - 216, coords.left - wrapRect.left),
      );
      const y = coords.bottom - wrapRect.top + 6;
      setSlash((prev) => ({
        open: true,
        query,
        from: slashFrom,
        to: from,
        x,
        y,
        index: prev.open && prev.query === query ? prev.index : 0,
      }));
    } catch {
      setSlash((s) => (s.open ? { ...s, open: false } : s));
    }
  };

  const executeSlashCommand = (ed: Editor, cmd: SlashCommand) => {
    const s = slashRef.current;
    ed.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
    setSlash((prev) => ({ ...prev, open: false, query: "", index: 0 }));
    cmd.run(ed);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({
        placeholder: readonly
          ? "（无正文内容）"
          : "直接书写线索… 输入 / 呼出指令，选中文字排版（Cmd/Ctrl+Enter 保存）",
      }),
    ],
    content: markdownToTiptapHtml(value),
    editable: !readonly,
    editorProps: {
      attributes: {
        class: "notion-editor-content",
        "aria-label": "便签正文",
      },
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onSaveRef.current?.();
          return true;
        }
        const s = slashRef.current;
        if (s.open) {
          const list = filteredRef.current;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (list.length) {
              setSlash((prev) => ({
                ...prev,
                index: (prev.index + 1) % list.length,
              }));
            }
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (list.length) {
              setSlash((prev) => ({
                ...prev,
                index: (prev.index - 1 + list.length) % list.length,
              }));
            }
            return true;
          }
          if (event.key === "Enter" && list.length > 0) {
            event.preventDefault();
            const picked = list[Math.min(s.index, list.length - 1)];
            if (picked && editor) {
              executeSlashCommand(editor, picked);
            }
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setSlash((prev) => ({ ...prev, open: false }));
            return true;
          }
        }
        void view;
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = tiptapJsonToMarkdown(ed.getJSON());
      const bounded =
        md.length > MAX_NOTE_BODY_LENGTH
          ? md.slice(0, MAX_NOTE_BODY_LENGTH)
          : md;
      lastEmitted.current = bounded;
      onChangeRef.current(bounded);
      updateFloatingMenus(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      updateFloatingMenus(ed);
    },
    onBlur: () => {
      // Delay closing slightly so button mousedown/click inside bubble/slash menu registers
      window.setTimeout(() => {
        if (!wrapRef.current?.contains(document.activeElement)) {
          setBubble((b) => (b.open ? { ...b, open: false } : b));
          setSlash((s) => (s.open ? { ...s, open: false } : s));
        }
      }, 120);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readonly);
  }, [editor, readonly]);

  // Sync external updates (e.g., reloading latest note version after conflict)
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(markdownToTiptapHtml(value), {
      emitUpdate: false,
    });
  }, [editor, value]);

  const charCount = value.length;
  const nearLimit = charCount >= MAX_NOTE_BODY_LENGTH - 150;

  return (
    <div
      ref={wrapRef}
      className={`notion-editor-wrap ${readonly ? "is-readonly" : "is-editable"}`}
    >
      {/* Floating Selection Bubble Menu */}
      {bubble.open && editor && !readonly && (
        <div
          className="notion-bubble-menu"
          role="toolbar"
          aria-label="文字排版"
          style={{ left: `${bubble.x}px`, top: `${bubble.y}px` }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            title="加粗"
            aria-pressed={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            title="斜体"
            aria-pressed={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            title="删除线"
            aria-pressed={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <s>S</s>
          </button>
          <button
            type="button"
            title="行内代码"
            aria-pressed={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <code>&lt;/&gt;</code>
          </button>
          <button
            type="button"
            title="红墨标记重点"
            aria-pressed={editor.isActive("highlight")}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            重点
          </button>
          <button
            type="button"
            title="小标题"
            aria-pressed={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            H
          </button>
        </div>
      )}

      <EditorContent editor={editor} />

      {/* Slash Command Menu (/) */}
      {slash.open && editor && !readonly && (
        <div
          className="notion-slash-menu"
          role="listbox"
          aria-label="斜杠指令"
          style={{ left: `${slash.x}px`, top: `${slash.y}px` }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {filteredCommands.length === 0 ? (
            <div className="notion-slash-empty">没有匹配的指令</div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                role="option"
                aria-selected={idx === slash.index}
                className={`notion-slash-item ${idx === slash.index ? "active" : ""} ${cmd.group === "capability" ? "is-cap" : ""}`}
                onMouseEnter={() =>
                  setSlash((prev) => ({ ...prev, index: idx }))
                }
                onClick={() => executeSlashCommand(editor, cmd)}
              >
                <span className="notion-slash-badge">{cmd.badge}</span>
                <span className="notion-slash-meta">
                  <strong>{cmd.title}</strong>
                  <small>{cmd.hint}</small>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {!readonly && nearLimit && (
        <span
          className={`notion-char-count ${charCount >= MAX_NOTE_BODY_LENGTH ? "at-limit" : ""}`}
        >
          {charCount} / {MAX_NOTE_BODY_LENGTH}
        </span>
      )}
    </div>
  );
}
