import {
  CanvasTexture,
  SRGBColorSpace,
  NoColorSpace,
} from "../../engine/index.js";
import { paintPolaroidAging, paintPolaroidCrease } from "./polaroidAging.js";
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
export function createNoteTexture(note, image = null) {
  const width = 768,
    height = Math.round(width / cardAspect(note.cardStyle));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  const color =
    note.cardStyle === "polaroid" ? "#f1ede2" : paperColor(note.color);
  const dark = darkPaper(color);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  paintPolaroidAging(ctx, {
    width,
    height,
    wear: 0.28,
    seed: hash(note.id),
    window: { x: 0, y: 0, w: 0, h: 0 },
  });
  paintPolaroidCrease(ctx, { width, height, wear: 0.18, seed: hash(note.id) });
  let top = 130;
  if (note.cardStyle === "dossier") {
    ctx.strokeStyle = "rgba(70,65,55,.15)";
    ctx.lineWidth = 2;
    for (let y = 200; y < height - 90; y += 65) {
      ctx.beginPath();
      ctx.moveTo(42, y);
      ctx.lineTo(width - 42, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#a04b3c";
    ctx.font = "24px ui-monospace, monospace";
    ctx.fillText(`档案 / ${note.id.slice(-6).toUpperCase()}`, 46, 53);
  }
  if (note.cardStyle === "urgent") {
    ctx.strokeStyle = "#a74634";
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, width - 40, height - 40);
    ctx.fillStyle = "#99432f";
    ctx.font = "22px sans-serif";
    ctx.fillText("重要", 46, 55);
  }
  if (image) {
    const h = note.cardStyle === "polaroid" ? height * 0.64 : height * 0.35;
    const available = width - 80;
    const scale = Math.max(available / image.width, h / image.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(40, 60, available, h);
    ctx.clip();
    ctx.drawImage(
      image,
      (width - image.width * scale) / 2,
      60 + (h - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    ctx.restore();
    top = 60 + h + 65;
  } else if (note.cardStyle === "polaroid") {
    const h = height * 0.56;
    const available = width - 80;
    ctx.save();
    ctx.fillStyle = "rgba(38, 34, 28, 0.085)";
    ctx.fillRect(40, 60, available, h);
    ctx.strokeStyle = "rgba(64, 56, 44, 0.2)";
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 60, available, h);
    ctx.fillStyle = "rgba(82, 72, 58, 0.45)";
    ctx.font = '500 28px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("点击添加影像", width / 2, 60 + h / 2 + 10);
    ctx.restore();
    top = 60 + h + 65;
  }
  const isSealedStub =
    note.title === "机密便签" &&
    !note.body &&
    note.capabilities.some(
      (c) => c.type === "secret" && c.enabled && c.data?.scope !== "all",
    );
  if (isSealedStub) {
    ctx.save();
    ctx.translate(width / 2, height * 0.52);
    ctx.rotate(-0.26);
    ctx.strokeStyle = "rgba(154, 48, 36, 0.72)";
    ctx.lineWidth = 8;
    ctx.strokeRect(-220, -64, 440, 128);
    ctx.fillStyle = "rgba(154, 48, 36, 0.78)";
    ctx.font = '700 54px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("机密封条", 0, -4);
    ctx.font = "600 20px ui-monospace, monospace";
    ctx.fillText("SEALED · RESTRICTED", 0, 38);
    ctx.restore();
  }
  ctx.fillStyle = dark ? "#f1e5cb" : "#332d23";
  ctx.font = '600 54px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  const title = wrapText(ctx, note.title, width - 90, 2);
  title.forEach((line, i) => ctx.fillText(line, 46, top + i * 64));
  top += title.length * 64 + 24;
  ctx.fillStyle = dark ? "#e2cfb1" : "#474033";
  ctx.font = '36px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  const maxLines = Math.max(
    0,
    Math.min(5, Math.floor((height - top - 115) / 62)),
  );
  wrapText(
    ctx,
    note.body.replace(/[#*`>]/g, ""),
    width - 100,
    maxLines,
  ).forEach((line, i) => ctx.fillText(line, 46, top + i * 62));
  ctx.font = '27px "PingFang SC", sans-serif';
  ctx.fillStyle = dark ? "#e2cfb1" : "#675b46";
  const capabilities = note.capabilities.filter((c) => c.enabled);
  const shown = capabilities.slice(0, capabilities.length > 3 ? 2 : 3);
  shown.forEach((cap, i) =>
    capabilityRegistry.get(cap.type)?.drawSurfaceBadge(ctx, cap.data, {
      x: 46 + i * 218,
      y: height - 87,
      width: 206,
      height: 50,
    }),
  );
  if (capabilities.length > 3)
    ctx.fillText(`+${capabilities.length - 2}`, width - 100, height - 53);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  return texture;
}
function hash(s) {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h >>> 0;
}
const roughMaps = new Map();
export function noteRoughnessMap(note, photo = false) {
  const key = `${note.cardStyle}:${photo}`;
  if (roughMaps.has(key)) return roughMaps.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = Math.round(128 / cardAspect(note.cardStyle));
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  ctx.fillStyle = "#e4e4e4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (photo) {
    ctx.fillStyle = "#343434";
    ctx.fillRect(
      (40 / 768) * canvas.width,
      (60 / (768 / cardAspect(note.cardStyle))) * canvas.height,
      canvas.width * (688 / 768),
      canvas.height * (note.cardStyle === "polaroid" ? 0.64 : 0.35),
    );
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  roughMaps.set(key, texture);
  return texture;
}
