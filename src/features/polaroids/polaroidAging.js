export const PHOTO_NEUTRAL = `#808080`;
export const PHOTO_OVERLAY_INSET = 8;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function blobPath(ctx, x, y, r, rand, jag = 0.35) {
  const points = 14;
  const radii = Array.from(
    {
      length: points,
    },
    () => r * (1 - jag / 2 + jag * rand()),
  );
  ctx.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const a0 = ((i % points) / points) * Math.PI * 2;
    const a1 = (((i + 0.5) % points) / points) * Math.PI * 2;
    const r0 = radii[i % points];
    const r1 = (r0 + radii[(i + 1) % points]) / 2;
    const px = x + Math.cos(a0) * r0;
    const py = y + Math.sin(a0) * r0;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.quadraticCurveTo(px, py, x + Math.cos(a1) * r1, y + Math.sin(a1) * r1);
    }
  }
  ctx.closePath();
}
function softSpot(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color}, ${alpha})`);
  g.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function nearEdge(rand, width, height, depth) {
  const side = Math.floor(rand() * 4);
  const along = rand();
  const inset = rand() * depth;
  if (side === 0) {
    return [along * width, inset];
  }
  if (side === 1) {
    return [width - inset, along * height];
  }
  if (side === 2) {
    return [along * width, height - inset];
  }
  return [inset, along * height];
}
function scratch(ctx, x, y, length, angle, rand, color, alpha, lineWidth = 1) {
  ctx.strokeStyle = `rgba(${color}, ${alpha})`;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const bend = (rand() - 0.5) * 0.3;
  ctx.quadraticCurveTo(
    x + Math.cos(angle + bend) * length * 0.5,
    y + Math.sin(angle + bend) * length * 0.5,
    x + Math.cos(angle) * length,
    y + Math.sin(angle) * length,
  );
  ctx.stroke();
}
function crease(ctx, width, height, rand, wear) {
  const corner = Math.floor(rand() * 4);
  const reach = Math.min(width, height) * (0.08 + 0.14 * rand()) * (0.6 + wear * 0.6);
  const cx = corner % 2 === 0 ? 0 : width;
  const cy = corner < 2 ? 0 : height;
  const sx = cx === 0 ? 1 : -1;
  const sy = cy === 0 ? 1 : -1;
  const a = [cx + sx * reach * (0.7 + 0.6 * rand()), cy];
  const b = [cx, cy + sy * reach * (0.7 + 0.6 * rand())];
  const nx = sy;
  const ny = -sx;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const off = [(nx * 1.6 * (b[1] - a[1])) / len, (ny * 1.6 * (a[0] - b[0])) / len];
  ctx.lineCap = `round`;
  ctx.strokeStyle = `rgba(255, 252, 244, ${0.5 * wear + 0.2})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.strokeStyle = `rgba(70, 55, 35, ${0.25 * wear + 0.1})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(a[0] + off[0], a[1] + off[1]);
  ctx.lineTo(b[0] + off[0], b[1] + off[1]);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.closePath();
  ctx.fillStyle = `rgba(150, 120, 80, ${0.12 * wear})`;
  ctx.fill();
  ctx.restore();
}
export function paintPolaroidAging(ctx, { width, height, window: win, wear, seed }) {
  if (!(wear > 0)) {
    return;
  }
  const rand = mulberry32(seed);
  const unit = Math.min(width, height);
  ctx.save();
  ctx.globalCompositeOperation = `multiply`;
  ctx.fillStyle = `rgb(255, ${Math.round(255 - 12 * wear)}, ${Math.round(255 - 34 * wear)})`;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 5; i += 1) {
    const [x, y] = nearEdge(rand, width, height, unit * 0.3);
    softSpot(ctx, x, y, unit * (0.3 + 0.4 * rand()), `236, 218, 184`, 0.3 * wear);
  }
  for (const [cx, cy] of [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ]) {
    const dirt = rand() * wear;
    softSpot(ctx, cx, cy, unit * (0.08 + 0.12 * rand()), `140, 112, 78`, 0.45 * dirt);
  }
  const grime = Math.round(40 + 140 * wear);
  for (let i = 0; i < grime; i += 1) {
    const [x, y] = nearEdge(rand, width, height, unit * 0.05);
    softSpot(ctx, x, y, unit * (0.01 + 0.04 * rand()), `150, 125, 90`, 0.18 * wear * rand());
  }
  const edge = Math.max(2, unit * 0.006);
  ctx.strokeStyle = `rgba(160, 135, 100, ${0.35 * wear})`;
  ctx.lineWidth = edge * 2;
  ctx.strokeRect(0, 0, width, height);
  const stains = Math.floor(wear * 2.4 + rand() * wear * 1.5);
  for (let i = 0; i < stains; i += 1) {
    const onEdge = rand() < 0.7;
    const [x, y] = onEdge
      ? nearEdge(rand, width, height, unit * 0.12)
      : [rand() * width, win.y + win.h + rand() * (height - win.y - win.h)];
    const r = unit * (0.04 + 0.12 * rand());
    blobPath(ctx, x, y, r, rand);
    ctx.fillStyle = `rgba(214, 180, 128, ${0.28 * wear})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(165, 125, 75, ${0.32 * wear})`;
    ctx.lineWidth = 1.5 + rand() * 1.5;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = `source-over`;
  const specks = Math.round(20 + 90 * wear);
  for (let i = 0; i < specks; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    ctx.fillStyle = `rgba(60, 48, 34, ${0.15 + 0.35 * rand() * wear})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.5 + rand() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const scuffs = Math.round(6 + 26 * wear);
  for (let i = 0; i < scuffs; i += 1) {
    const [x, y] =
      rand() < 0.6 ? nearEdge(rand, width, height, unit * 0.15) : [rand() * width, rand() * height];
    scratch(
      ctx,
      x,
      y,
      unit * (0.02 + 0.08 * rand()),
      rand() * Math.PI * 2,
      rand,
      `255, 253, 247`,
      0.25 + 0.35 * rand(),
    );
  }
  ctx.restore();
}
export function paintPolaroidCrease(ctx, { width, height, wear, seed }) {
  if (!(wear > 0)) {
    return;
  }
  const rand = mulberry32(seed ^ 2654435769);
  if (rand() > 0.35 + wear * 0.6) {
    return;
  }
  ctx.save();
  crease(ctx, width, height, rand, wear);
  ctx.restore();
}
export function paintPhotoOverlay(ctx, { window: win, wear, seed }) {
  const inset = PHOTO_OVERLAY_INSET;
  const x0 = win.x + inset;
  const y0 = win.y + inset;
  const w = win.w - inset * 2;
  const h = win.h - inset * 2;
  ctx.save();
  ctx.fillStyle = PHOTO_NEUTRAL;
  ctx.fillRect(x0, y0, w, h);
  if (wear > 0) {
    const rand = mulberry32(seed ^ 1540483477);
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    const unit = Math.min(w, h);
    const dust = Math.round(10 + 50 * wear);
    for (let i = 0; i < dust; i += 1) {
      ctx.fillStyle = `rgba(40, 40, 40, ${0.2 + 0.4 * rand()})`;
      ctx.beginPath();
      ctx.arc(x0 + rand() * w, y0 + rand() * h, 0.5 + rand() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    const scratches = Math.round(2 + 8 * wear);
    for (let i = 0; i < scratches; i += 1) {
      scratch(
        ctx,
        x0 + rand() * w,
        y0 + rand() * h,
        unit * (0.03 + 0.12 * rand()),
        rand() * Math.PI * 2,
        rand,
        `180, 180, 180`,
        0.3 + 0.4 * rand(),
        0.7 + rand() * 0.5,
      );
    }
    const rubs = Math.round(wear * 3);
    for (let i = 0; i < rubs; i += 1) {
      softSpot(
        ctx,
        x0 + rand() * w,
        y0 + rand() * h,
        unit * (0.08 + 0.15 * rand()),
        `200, 200, 200`,
        0.3 * wear,
      );
    }
  }
  ctx.restore();
}
