export function gaussianBoxRadii(sigma, passes = 3) {
  if (!(sigma > 0)) {
    return [];
  }
  const ideal = Math.sqrt((12 * sigma * sigma) / passes + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) {
    lower -= 1;
  }
  const upper = lower + 2;
  const smaller = Math.round(
    (12 * sigma * sigma - passes * lower * lower - 4 * passes * lower - 3 * passes) /
      (-4 * lower - 4),
  );
  return Array.from(
    {
      length: passes,
    },
    (_, pass) => ((pass < smaller ? lower : upper) - 1) / 2,
  );
}
function rowPass(source, target, size, radius) {
  const scale = 1 / (radius * 2 + 1);
  const last = size - 1;
  for (let base = 0; base < source.length; base += size) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += source[base + Math.min(last, Math.max(0, offset))];
    }
    for (let x = 0; x < size; x += 1) {
      target[base + x] = sum * scale;
      sum += source[base + Math.min(last, x + radius + 1)] - source[base + Math.max(0, x - radius)];
    }
  }
}
function columnPass(source, target, size, radius, sums) {
  const scale = 1 / (radius * 2 + 1);
  const last = size - 1;
  sums.fill(0);
  for (let offset = -radius; offset <= radius; offset += 1) {
    const row = Math.min(last, Math.max(0, offset)) * size;
    for (let x = 0; x < size; x += 1) {
      sums[x] += source[row + x];
    }
  }
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    const enter = Math.min(last, y + radius + 1) * size;
    const leave = Math.max(0, y - radius) * size;
    for (let x = 0; x < size; x += 1) {
      target[row + x] = sums[x] * scale;
      sums[x] += source[enter + x] - source[leave + x];
    }
  }
}
export function blurMask(values, size, sigma) {
  const scratch = new Float32Array(values.length);
  const sums = new Float32Array(size);
  for (const radius of gaussianBoxRadii(sigma)) {
    if (radius < 1) {
      continue;
    }
    rowPass(values, scratch, size, radius);
    columnPass(scratch, values, size, radius, sums);
  }
  return values;
}
