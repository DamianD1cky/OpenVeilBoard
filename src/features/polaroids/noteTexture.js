import {
  CanvasTexture,
  SRGBColorSpace,
  NoColorSpace,
  RepeatWrapping,
} from "../../engine/index.js";
import {
  paintPolaroidAging,
  paintPolaroidCrease,
  paintPhotoOverlay,
} from "./polaroidAging.js";
import { capabilityRegistry } from "../../domain/capabilityRegistry.ts";
import { paperColor, darkPaper } from "../../domain/paperColors.js";
import { paperAspect as cardAspect } from "../../domain/geometry.js";
export { paperAspect as cardAspect } from "../../domain/geometry.js";

export function wrapText(ctx, text, width, lines = 4) {
  if (lines <= 0) return [];
  const result = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (ctx.measureText(line + char).width > width && line) {
        result.push(line);
        line = "";
      }
      line += char;
    }
    result.push(line);
  }
  if (result.length > lines)
    result[lines - 1] = result[lines - 1].slice(0, -1) + "…";
  return result.slice(0, lines);
}

/**
 * Parse inline Markdown formatting into styled runs for physical 3D cardstock rendering.
 * Supports: `code`, ==highlight==, ~~strike~~, **bold**, *italic* (including nested combos).
 */
function parseInlineRuns(text, baseStyle = {}) {
  const runs = [];
  const str = String(text ?? "");
  let i = 0;
  let plain = "";
  const flushPlain = () => {
    if (plain) {
      runs.push({ text: plain, ...baseStyle });
      plain = "";
    }
  };
  const patterns = [
    { open: "`", close: "`", flag: "code", recurse: false },
    { open: "==", close: "==", flag: "highlight", recurse: true },
    { open: "~~", close: "~~", flag: "strike", recurse: true },
    { open: "**", close: "**", flag: "bold", recurse: true },
    { open: "*", close: "*", flag: "italic", recurse: true },
  ];
  while (i < str.length) {
    let matched = false;
    for (const p of patterns) {
      if (!str.startsWith(p.open, i)) continue;
      // Avoid matching `**` as single `*`
      if (p.open === "*" && str.startsWith("**", i)) continue;
      const start = i + p.open.length;
      const end = str.indexOf(p.close, start);
      if (end > start) {
        flushPlain();
        const inner = str.slice(start, end);
        const nextStyle = { ...baseStyle, [p.flag]: true };
        if (p.recurse) {
          runs.push(...parseInlineRuns(inner, nextStyle));
        } else {
          runs.push({ text: inner, ...nextStyle });
        }
        i = end + p.close.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += str[i];
      i++;
    }
  }
  flushPlain();
  return runs;
}

function runFont(run, baseSize) {
  if (run.code) {
    const size = Math.round(baseSize * 0.86);
    return `${run.bold ? "700 " : "500 "}${size}px ui-monospace, "SF Mono", Menlo, monospace`;
  }
  const weight = run.heading || run.bold ? "700" : "400";
  const italic = run.italic ? "italic " : "";
  const size = run.heading ? Math.round(baseSize * 1.12) : baseSize;
  const family = run.heading
    ? '"Songti SC", "Noto Serif SC", Georgia, "PingFang SC", serif'
    : '"PingFang SC", "Noto Sans CJK SC", sans-serif';
  return `${italic}${weight} ${size}px ${family}`;
}

function drawRichBody(ctx, body, { x, y, maxW, maxLines, lineH, dark }) {
  if (!body || maxLines <= 0) return;
  const baseSize = 34;
  const inkMain = dark ? "#e4d2b4" : "#3f372b";
  const inkStrong = dark ? "#f7ecd4" : "#221b13";
  const inkMuted = dark ? "rgba(228, 210, 180, 0.66)" : "rgba(63, 55, 43, 0.62)";
  const highlightBg = dark
    ? "rgba(224, 102, 86, 0.34)"
    : "rgba(182, 48, 36, 0.22)";
  const codeBg = dark
    ? "rgba(244, 232, 206, 0.12)"
    : "rgba(62, 48, 30, 0.09)";
  const codeBorder = dark
    ? "rgba(244, 232, 206, 0.28)"
    : "rgba(62, 48, 30, 0.24)";

  // Convert Markdown lines into structured visual lines
  const rawLines = String(body)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l, idx, arr) => l.trim().length > 0 || (idx > 0 && idx < arr.length - 1 && arr[idx - 1].trim().length > 0));

  const visualLines = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      visualLines.push({ kind: "hr" });
      continue;
    }

    let kind = "p";
    let indent = 0;
    let prefix = null;
    let checked = false;
    let content = trimmed;
    let baseRun = {};

    const hMatch = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    const taskMatch = /^[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(trimmed);
    const quoteMatch = /^>\s*(.*)$/.exec(trimmed);
    const bulletMatch = /^[-*+]\s+(.*)$/.exec(trimmed);
    const orderedMatch = /^(\d+\.)\s+(.*)$/.exec(trimmed);

    if (hMatch) {
      kind = "heading";
      content = hMatch[2];
      baseRun = { heading: true, bold: true };
    } else if (taskMatch) {
      kind = "task";
      checked = taskMatch[1].toLowerCase() === "x";
      content = taskMatch[2];
      indent = 34;
      if (checked) baseRun = { strike: true, muted: true };
    } else if (quoteMatch) {
      kind = "quote";
      content = quoteMatch[1];
      indent = 24;
      baseRun = { italic: true, muted: true };
    } else if (bulletMatch) {
      kind = "bullet";
      content = bulletMatch[1];
      indent = 24;
      prefix = "•";
    } else if (orderedMatch) {
      kind = "ordered";
      content = orderedMatch[2];
      indent = 36;
      prefix = orderedMatch[1];
    }

    const runs = parseInlineRuns(content, baseRun);
    const availW = Math.max(80, maxW - indent);
    let current = [];
    let currentW = 0;
    let firstWrap = true;

    const pushCurrent = () => {
      visualLines.push({
        kind,
        indent,
        prefix: firstWrap ? prefix : null,
        hasCheckbox: kind === "task" && firstWrap,
        checked,
        runs: current,
      });
      current = [];
      currentW = 0;
      firstWrap = false;
    };

    for (const run of runs) {
      ctx.font = runFont(run, baseSize);
      const padExtra = run.code ? 14 : run.highlight ? 6 : 0;
      let seg = "";
      for (const ch of run.text) {
        const nextW = ctx.measureText(seg + ch).width + padExtra;
        if (currentW + nextW > availW && (current.length > 0 || seg.length > 0)) {
          if (seg) {
            current.push({ ...run, text: seg, w: ctx.measureText(seg).width });
            seg = "";
          }
          pushCurrent();
        }
        seg += ch;
      }
      if (seg) {
        const w = ctx.measureText(seg).width;
        current.push({ ...run, text: seg, w });
        currentW += w + padExtra;
      }
    }
    if (current.length || kind === "task") {
      pushCurrent();
    }
    if (visualLines.length > maxLines) break;
  }

  const truncated = visualLines.length > maxLines;
  const shown = visualLines.slice(0, maxLines);

  shown.forEach((line, idx) => {
    const baselineY = y + idx * lineH;
    if (line.kind === "hr") {
      ctx.save();
      ctx.strokeStyle = dark ? "rgba(241, 229, 203, 0.28)" : "rgba(68, 56, 40, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, baselineY - 10);
      ctx.lineTo(x + maxW, baselineY - 10);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (line.kind === "quote") {
      ctx.save();
      ctx.fillStyle = dark ? "rgba(241, 229, 203, 0.36)" : "rgba(74, 58, 38, 0.34)";
      ctx.fillRect(x + 2, baselineY - 28, 4, 34);
      ctx.restore();
    } else if (line.hasCheckbox) {
      ctx.save();
      const bx = x + 2;
      const by = baselineY - 24;
      const bs = 22;
      ctx.strokeStyle = dark ? "#e4d2b4" : "#443c30";
      ctx.lineWidth = 2.4;
      ctx.strokeRect(bx, by, bs, bs);
      if (line.checked) {
        ctx.fillStyle = dark ? "#e4d2b4" : "#3f372b";
        ctx.fillRect(bx, by, bs, bs);
        ctx.strokeStyle = dark ? "#241f18" : "#f5efe2";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx + 4, by + 11);
        ctx.lineTo(bx + 9, by + 17);
        ctx.lineTo(bx + 18, by + 5);
        ctx.stroke();
      }
      ctx.restore();
    } else if (line.prefix) {
      ctx.save();
      ctx.fillStyle = inkMuted;
      ctx.font = `600 ${Math.round(baseSize * 0.9)}px "PingFang SC", sans-serif`;
      ctx.fillText(line.prefix, x + 2, baselineY);
      ctx.restore();
    }

    let cursorX = x + line.indent;
    const isLastTruncated = truncated && idx === shown.length - 1;

    line.runs.forEach((run, rIdx) => {
      const isLastRun = isLastTruncated && rIdx === line.runs.length - 1;
      const text = isLastRun
        ? `${run.text.slice(0, Math.max(0, run.text.length - 1))}…`
        : run.text;
      ctx.font = runFont(run, baseSize);
      const textW = ctx.measureText(text).width;

      if (run.highlight) {
        ctx.save();
        ctx.fillStyle = highlightBg;
        ctx.fillRect(cursorX - 2, baselineY - 30, textW + 6, 36);
        ctx.restore();
      }
      if (run.code) {
        ctx.save();
        ctx.fillStyle = codeBg;
        ctx.strokeStyle = codeBorder;
        ctx.lineWidth = 1.6;
        ctx.fillRect(cursorX + 1, baselineY - 28, textW + 12, 34);
        ctx.strokeRect(cursorX + 1, baselineY - 28, textW + 12, 34);
        ctx.restore();
        cursorX += 7;
      }

      ctx.save();
      ctx.fillStyle = run.muted
        ? inkMuted
        : run.heading || run.bold || run.highlight
          ? inkStrong
          : inkMain;
      ctx.fillText(text, cursorX, baselineY);

      if (run.strike) {
        ctx.strokeStyle = run.muted ? inkMuted : inkMain;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(cursorX, baselineY - 11);
        ctx.lineTo(cursorX + textW, baselineY - 11);
        ctx.stroke();
      }
      ctx.restore();

      cursorX += textW + (run.code ? 9 : run.highlight ? 4 : 0);
    });
  });
}

function hash(s) {
  let h = 0;
  for (const c of String(s ?? "note")) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h >>> 0;
}

function seededRand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintCardstockGrain(ctx, width, height, seed, dark) {
  const rand = seededRand(seed ^ 0x9e3779b9);
  ctx.save();
  // Subtle woven cotton fiber streaks
  for (let i = 0; i < 160; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const len = 10 + rand() * 34;
    const horiz = rand() > 0.35;
    const angle = horiz ? (rand() - 0.5) * 0.14 : Math.PI / 2 + (rand() - 0.5) * 0.14;
    ctx.strokeStyle = dark
      ? `rgba(255, 245, 224, ${0.015 + rand() * 0.028})`
      : `rgba(74, 58, 38, ${0.018 + rand() * 0.032})`;
    ctx.lineWidth = 0.8 + rand() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  // Soft inner vignette so the cardstock isn't a flat digital fill
  const vig = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    Math.min(width, height) * 0.25,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(
    1,
    dark ? "rgba(0,0,0,0.22)" : "rgba(72, 54, 30, 0.11)",
  );
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // Subtle physical cardstock bevel along the cut edges
  ctx.strokeStyle = dark
    ? "rgba(255, 244, 224, 0.12)"
    : "rgba(255, 253, 246, 0.58)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2, height - 2);
  ctx.lineTo(2, 2);
  ctx.lineTo(width - 2, 2);
  ctx.stroke();

  ctx.strokeStyle = dark
    ? "rgba(0, 0, 0, 0.45)"
    : "rgba(56, 44, 28, 0.22)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(width - 2, 2);
  ctx.lineTo(width - 2, height - 2);
  ctx.lineTo(2, height - 2);
  ctx.stroke();

  // Subtle pin indentation shadow near top-center where pushpin presses paper
  const pinAO = ctx.createRadialGradient(
    width * 0.5,
    height * 0.055,
    2,
    width * 0.5,
    height * 0.055,
    42,
  );
  pinAO.addColorStop(0, "rgba(26, 20, 14, 0.26)");
  pinAO.addColorStop(0.45, "rgba(26, 20, 14, 0.08)");
  pinAO.addColorStop(1, "rgba(26, 20, 14, 0)");
  ctx.fillStyle = pinAO;
  ctx.fillRect(width * 0.5 - 44, 0, 88, height * 0.12);

  ctx.restore();
}

function drawNoteToCanvas(canvas, note, image = null) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  const seed = hash(note.id);
  const isPolaroid = note.cardStyle === "polaroid";
  const color = isPolaroid ? "#f2eee4" : paperColor(note.color);
  const dark = darkPaper(color);

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  paintCardstockGrain(ctx, width, height, seed, dark);
  paintPolaroidAging(ctx, {
    width,
    height,
    wear: isPolaroid ? 0.22 : 0.32,
    seed,
    window: { x: 0, y: 0, w: 0, h: 0 },
  });
  paintPolaroidCrease(ctx, { width, height, wear: 0.22, seed });

  let top = 114;
  const enabledCaps = (note.capabilities ?? []).filter((c) => c.enabled);

  if (note.cardStyle === "dossier") {
    // Classic index dossier header band + faint ruled lines
    ctx.fillStyle = "rgba(145, 62, 46, 0.08)";
    ctx.fillRect(36, 36, width - 72, 42);
    ctx.strokeStyle = "rgba(145, 62, 46, 0.34)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, 78);
    ctx.lineTo(width - 36, 78);
    ctx.stroke();

    ctx.strokeStyle = dark
      ? "rgba(241, 229, 203, 0.12)"
      : "rgba(68, 60, 48, 0.15)";
    ctx.lineWidth = 1.6;
    const ruleStop = height - (enabledCaps.length > 0 ? 102 : 44);
    for (let y = 196; y < ruleStop; y += 64) {
      ctx.beginPath();
      ctx.moveTo(44, y);
      ctx.lineTo(width - 44, y);
      ctx.stroke();
    }
    ctx.fillStyle = dark ? "#e59a86" : "#963f31";
    ctx.font = '600 22px ui-monospace, "SF Mono", monospace';
    ctx.fillText(`DOSSIER // ${String(note.id ?? "NEW").slice(-6).toUpperCase()}`, 48, 64);
    top = 142;
  }

  if (note.cardStyle === "urgent") {
    ctx.strokeStyle = "rgba(167, 66, 46, 0.82)";
    ctx.lineWidth = 10;
    ctx.strokeRect(22, 22, width - 44, height - 44);
    ctx.strokeStyle = "rgba(167, 66, 46, 0.32)";
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, width - 68, height - 68);
    ctx.fillStyle = "#9b3c2b";
    ctx.font = '700 22px "PingFang SC", ui-monospace, sans-serif';
    ctx.fillText("URGENT · 紧急线索", 48, 66);
    top = 136;
  }

  // Photo window (Polaroid authentic framing vs inline photo on other cards)
  if (image || isPolaroid) {
    const padX = isPolaroid ? Math.round(width * 0.068) : 44;
    const padTop = isPolaroid ? Math.round(height * 0.062) : 64;
    const availW = width - padX * 2;
    const photoH = isPolaroid ? Math.round(height * 0.66) : Math.round(height * 0.36);

    if (image) {
      const scale = Math.max(availW / image.width, photoH / image.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(padX, padTop, availW, photoH);
      ctx.clip();
      ctx.drawImage(
        image,
        padX + (availW - image.width * scale) / 2,
        padTop + (photoH - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
      // Warm darkroom film emulsion vignette & micro-dust overlay
      const filmVig = ctx.createRadialGradient(
        padX + availW / 2,
        padTop + photoH / 2,
        Math.min(availW, photoH) * 0.25,
        padX + availW / 2,
        padTop + photoH / 2,
        Math.max(availW, photoH) * 0.72,
      );
      filmVig.addColorStop(0, "rgba(255, 246, 232, 0.04)");
      filmVig.addColorStop(1, "rgba(16, 12, 8, 0.28)");
      ctx.fillStyle = filmVig;
      ctx.fillRect(padX, padTop, availW, photoH);
      ctx.globalCompositeOperation = "soft-light";
      paintPhotoOverlay(ctx, {
        window: { x: padX, y: padTop, w: availW, h: photoH },
        wear: 0.22,
        seed,
      });
      ctx.restore();
    } else {
      // Polaroid darkroom unexposed emulsion bay
      ctx.save();
      const grad = ctx.createLinearGradient(padX, padTop, padX + availW, padTop + photoH);
      grad.addColorStop(0, "#23201c");
      grad.addColorStop(1, "#171512");
      ctx.fillStyle = grad;
      ctx.fillRect(padX, padTop, availW, photoH);
      ctx.fillStyle = "rgba(232, 220, 200, 0.36)";
      ctx.font = '500 24px "PingFang SC", "Noto Sans CJK SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("点击投射线索影像", width / 2, padTop + photoH / 2);
      ctx.restore();
    }
    // Recessed lip border around photo window
    ctx.save();
    ctx.strokeStyle = "rgba(32, 24, 16, 0.28)";
    ctx.lineWidth = 3;
    ctx.strokeRect(padX + 1, padTop + 1, availW - 2, photoH - 2);
    ctx.restore();
    top = padTop + photoH + (isPolaroid ? 58 : 56);
  }

  const isSealedStub =
    note.title === "机密便签" &&
    !note.body &&
    (note.capabilities ?? []).some(
      (c) => c.type === "secret" && c.enabled && c.data?.scope !== "all",
    );
  if (isSealedStub) {
    ctx.save();
    ctx.translate(width / 2, height * 0.52);
    ctx.rotate(-0.24);
    ctx.strokeStyle = "rgba(154, 48, 36, 0.78)";
    ctx.lineWidth = 8;
    ctx.strokeRect(-220, -64, 440, 128);
    ctx.fillStyle = "rgba(154, 48, 36, 0.82)";
    ctx.font = '700 54px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("机密封条", 0, -4);
    ctx.font = "600 20px ui-monospace, monospace";
    ctx.fillText("SEALED · RESTRICTED", 0, 38);
    ctx.restore();
  }

  // Clean horizontal segmented tally bar for notes carrying an event clock (no pie circle)
  const clockCap = enabledCaps.find((c) => c.type === "event_clock");
  if (clockCap && !isPolaroid) {
    const segs = Math.max(2, Math.min(24, Number(clockCap.data?.segments) || 6));
    const val = Math.max(0, Math.min(segs, Number(clockCap.data?.value) || 0));
    const barW = Math.min(260, width * 0.36);
    const barH = 18;
    const bx = width - barW - 46;
    const by = height - 74;
    const gap = segs > 10 ? 3 : 5;
    const sw = (barW - gap * (segs - 1)) / segs;
    ctx.save();
    ctx.globalAlpha = dark ? 0.65 : 0.5;
    for (let i = 0; i < segs; i++) {
      const x = bx + i * (sw + gap);
      if (i < val) {
        ctx.fillStyle = dark ? "#e97b68" : "#9c2f22";
        ctx.fillRect(x, by, sw, barH);
      } else {
        ctx.strokeStyle = dark ? "#e97b68" : "#9c2f22";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, by + 1, sw - 2, barH - 2);
      }
    }
    ctx.restore();
  }

  // Ink absorption pass
  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = dark ? "#f3e8d0" : "#2c251c";
  if (isPolaroid) {
    // Classic Polaroid handwritten/editorial bottom caption
    ctx.font = '600 46px "Songti SC", "Noto Serif SC", Georgia, "PingFang SC", serif';
    const titleLines = wrapText(ctx, note.title, width - 104, 1);
    titleLines.forEach((line, i) => ctx.fillText(line, 52, top + i * 54));
    if (note.body && !image) {
      drawRichBody(ctx, note.body, {
        x: 52,
        y: top + 44,
        maxW: width - 104,
        maxLines: 1,
        lineH: 48,
        dark,
      });
    }
  } else {
    ctx.font = '700 52px "Songti SC", "Noto Serif SC", Georgia, "PingFang SC", serif';
    const title = wrapText(ctx, note.title, width - 92, 2);
    title.forEach((line, i) => ctx.fillText(line, 46, top + i * 62));
    top += title.length * 62 + 22;
    const footerReserve = enabledCaps.length > 0 ? 104 : 44;
    const maxLines = Math.max(
      0,
      Math.min(5, Math.floor((height - top - footerReserve) / 56)),
    );
    drawRichBody(ctx, note.body, {
      x: 46,
      y: top,
      maxW: width - 98,
      maxLines,
      lineH: 56,
      dark,
    });
  }
  ctx.restore();

  // Capability badges
  ctx.font = '26px "PingFang SC", sans-serif';
  ctx.fillStyle = dark ? "#e2cfb1" : "#655844";
  const capabilities = enabledCaps;
  const shown = capabilities.slice(0, capabilities.length > 3 ? 2 : 3);
  shown.forEach((cap, i) =>
    capabilityRegistry.get(cap.type)?.drawSurfaceBadge(ctx, cap.data, {
      x: 46 + i * 218,
      y: height - 86,
      width: 206,
      height: 48,
    }),
  );
  if (capabilities.length > 3)
    ctx.fillText(`+${capabilities.length - 2}`, width - 98, height - 53);
}

export function createNoteTexture(note, image = null) {
  const width = 768,
    height = Math.round(width / cardAspect(note));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  drawNoteToCanvas(canvas, note, image);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  return texture;
}

/**
 * @param {any} note
 * @param {HTMLImageElement | null} [image]
 * @returns {string}
 */
export function renderNotePreviewDataUrl(note, image = null) {
  const aspect = cardAspect(note);
  const width = 384;
  const height = Math.round(width / aspect);
  const full = document.createElement("canvas");
  full.width = 768;
  full.height = Math.round(768 / aspect);
  drawNoteToCanvas(full, note, image);
  const thumb = document.createElement("canvas");
  thumb.width = width;
  thumb.height = height;
  const tctx = thumb.getContext("2d", { colorSpace: "srgb" });
  tctx.drawImage(full, 0, 0, width, height);
  return thumb.toDataURL("image/webp", 0.86);
}

const roughMaps = new Map();
export function noteRoughnessMap(note, photo = false) {
  const aspect = cardAspect(note);
  const key = `${note.cardStyle}:${photo}:${Math.round(aspect * 20)}`;
  if (roughMaps.has(key)) return roughMaps.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = Math.round(192 / aspect);
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  const isPolaroid = note.cardStyle === "polaroid";
  // Satin-matte cardstock base with gentle organic variation
  ctx.fillStyle = isPolaroid ? "#b8b8b8" : "#d4d4d4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rand = seededRand(hash(key));
  for (let i = 0; i < 90; i++) {
    const shade = (isPolaroid ? 172 : 196) + Math.floor(rand() * 34);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.28)`;
    ctx.beginPath();
    ctx.arc(rand() * canvas.width, rand() * canvas.height, 4 + rand() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  if (photo || isPolaroid) {
    // Glossy photo emulsion region
    const padX = isPolaroid ? canvas.width * 0.068 : (44 / 768) * canvas.width;
    const padTop = isPolaroid ? canvas.height * 0.062 : (64 / (768 / aspect)) * canvas.height;
    const availW = canvas.width - padX * 2;
    const photoH = canvas.height * (isPolaroid ? 0.66 : 0.36);
    ctx.fillStyle = photo ? "#1c1c1c" : "#444444";
    ctx.fillRect(padX, padTop, availW, photoH);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.anisotropy = 4;
  roughMaps.set(key, texture);
  return texture;
}

let cachedPaperNormal = null;
/**
 * Shared procedural tangent-space paper fiber micro-normal map.
 * Gives every note realistic cotton-cardstock tooth under directional lighting.
 */
export function notePaperNormalMap() {
  if (cachedPaperNormal) return cachedPaperNormal;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  const rand = seededRand(0x517cc1b7);
  // Tileable multi-scale fiber heightfield
  for (let i = 0; i < size * size; i++) {
    h[i] = (rand() - 0.5) * 0.45;
  }
  // Directional cotton fibers wrapped across tile borders
  for (let k = 0; k < 220; k++) {
    const x0 = Math.floor(rand() * size);
    const y0 = Math.floor(rand() * size);
    const len = 8 + Math.floor(rand() * 24);
    const horiz = rand() > 0.45;
    const amp = (rand() > 0.5 ? 1 : -1) * (0.25 + rand() * 0.35);
    for (let s = 0; s < len; s++) {
      const x = (x0 + (horiz ? s : 0)) & (size - 1);
      const y = (y0 + (horiz ? 0 : s)) & (size - 1);
      h[y * size + x] += amp;
    }
  }
  // One box-blur pass to smooth pixel noise into soft paper grain
  const blur = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & (size - 1);
    const yp = (y + 1) & (size - 1);
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & (size - 1);
      const xp = (x + 1) & (size - 1);
      blur[y * size + x] =
        (h[y * size + x] * 4 +
          h[y * size + xm] +
          h[y * size + xp] +
          h[ym * size + x] +
          h[yp * size + x]) /
        8;
    }
  }
  const strength = 1.65;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & (size - 1);
    const yp = (y + 1) & (size - 1);
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & (size - 1);
      const xp = (x + 1) & (size - 1);
      const dx = (blur[y * size + xp] - blur[y * size + xm]) * strength;
      const dy = (blur[yp * size + x] - blur[ym * size + x]) * strength;
      const invLen = 1 / Math.hypot(dx, dy, 1);
      const nx = -dx * invLen;
      const ny = -dy * invLen;
      const nz = invLen;
      const idx = (y * size + x) * 4;
      img.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(2.5, 3.0);
  tex.anisotropy = 4;
  cachedPaperNormal = tex;
  return tex;
}
