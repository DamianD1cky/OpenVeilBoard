import DOMPurify from "dompurify";
import { marked } from "marked";
import type { JSONContent } from "@tiptap/react";

export const MAX_NOTE_BODY_LENGTH = 1000;

/**
 * Convert stored Markdown string into Tiptap-compatible HTML,
 * supporting GFM task lists (`- [ ]` / `- [x]`) and `==highlight==` marks.
 */
export function markdownToTiptapHtml(markdown: string): string {
  const src = String(markdown ?? "");
  if (!src.trim()) return "";

  // Convert ==highlight== outside inline code spans into <mark>...</mark>
  const withMarks = src.replace(
    /(`[^`]*`)|==([^=\n]+?)==/g,
    (match, code, inner) => (code ? match : `<mark>${inner}</mark>`),
  );

  const rawHtml = marked.parse(withMarks, {
    async: false,
    gfm: true,
    breaks: true,
  }) as string;

  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "strong",
      "b",
      "em",
      "i",
      "s",
      "del",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "hr",
      "mark",
      "input",
      "a",
    ],
    ALLOWED_ATTR: ["type", "checked", "disabled", "href", "data-type", "data-checked"],
  });

  if (typeof document === "undefined") return clean;

  // Upgrade marked's GFM checkbox lists into Tiptap TaskList / TaskItem nodes
  const container = document.createElement("div");
  container.innerHTML = clean;
  for (const ul of Array.from(container.querySelectorAll("ul"))) {
    const items = Array.from(ul.children).filter(
      (el): el is HTMLLIElement => el.tagName === "LI",
    );
    const hasTask = items.some((li) =>
      Boolean(li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]')),
    );
    if (!hasTask) continue;
    ul.setAttribute("data-type", "taskList");
    for (const li of items) {
      const box = li.querySelector(
        ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
      ) as HTMLInputElement | null;
      const checked = Boolean(box?.checked || box?.hasAttribute("checked"));
      box?.remove();
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", checked ? "true" : "false");
      // Trim leading whitespace left after removing checkbox input
      const firstNode = li.firstChild;
      if (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.textContent) {
        firstNode.textContent = firstNode.textContent.replace(/^\s+/, "");
      } else if (firstNode && firstNode.nodeName === "P" && firstNode.firstChild?.nodeType === Node.TEXT_NODE) {
        firstNode.firstChild.textContent = (firstNode.firstChild.textContent ?? "").replace(/^\s+/, "");
      }
    }
  }
  return container.innerHTML;
}

function serializeInline(nodes?: JSONContent[]): string {
  if (!nodes?.length) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type !== "text") return serializeInline(node.content);
      let text = node.text ?? "";
      if (!text) return "";
      const marks = node.marks ?? [];
      // Apply code first so other marks wrap cleanly around it
      const hasCode = marks.some((m) => m.type === "code");
      if (hasCode) text = `\`${text.replace(/`/g, "\\`")}\``;
      if (marks.some((m) => m.type === "bold")) text = `**${text}**`;
      if (marks.some((m) => m.type === "italic")) text = `*${text}*`;
      if (marks.some((m) => m.type === "strike")) text = `~~${text}~~`;
      if (marks.some((m) => m.type === "highlight")) text = `==${text}==`;
      return text;
    })
    .join("");
}

function serializeBlock(node: JSONContent, listIndent = ""): string {
  switch (node.type) {
    case "heading": {
      const level = Math.max(1, Math.min(4, Number(node.attrs?.level) || 3));
      const text = serializeInline(node.content).trim();
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    case "paragraph":
      return serializeInline(node.content);
    case "blockquote": {
      const inner = (node.content ?? [])
        .map((child) => serializeBlock(child, listIndent))
        .filter(Boolean)
        .join("\n");
      if (!inner) return "";
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    case "bulletList":
      return (node.content ?? [])
        .map((item) => serializeListItem(item, "- ", listIndent))
        .filter(Boolean)
        .join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start) || 1;
      return (node.content ?? [])
        .map((item, i) => serializeListItem(item, `${start + i}. `, listIndent))
        .filter(Boolean)
        .join("\n");
    }
    case "taskList":
      return (node.content ?? [])
        .map((item) => {
          const checked = Boolean(item.attrs?.checked);
          return serializeListItem(item, checked ? "- [x] " : "- [ ] ", listIndent);
        })
        .filter(Boolean)
        .join("\n");
    case "codeBlock": {
      const body = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`\n${body}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    default:
      return (node.content ?? [])
        .map((child) => serializeBlock(child, listIndent))
        .filter(Boolean)
        .join("\n\n");
  }
}

function serializeListItem(
  item: JSONContent,
  prefix: string,
  indent: string,
): string {
  const children = item.content ?? [];
  if (!children.length) return `${indent}${prefix}`;
  const lines: string[] = [];
  children.forEach((child, idx) => {
    if (
      child.type === "bulletList" ||
      child.type === "orderedList" ||
      child.type === "taskList"
    ) {
      const nested = serializeBlock(child, `${indent}  `);
      if (nested) lines.push(nested);
    } else {
      const text = serializeBlock(child, indent);
      if (idx === 0) {
        lines.push(`${indent}${prefix}${text}`);
      } else if (text) {
        lines.push(`${indent}  ${text}`);
      }
    }
  });
  return lines.join("\n");
}

/**
 * Serialize a Tiptap document JSON cleanly back to standard Markdown.
 */
export function tiptapJsonToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc?.content?.length) return "";
  const blocks = doc.content
    .map((node) => serializeBlock(node))
    .filter((block, idx, arr) => {
      // Drop trailing single empty paragraph when doc is otherwise empty
      if (arr.length === 1 && !block.trim()) return false;
      return block.length > 0;
    });
  return blocks.join("\n\n").trimEnd();
}
